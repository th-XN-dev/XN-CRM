<script setup lang="ts">
import { useEventListener, watchDebounced } from '@vueuse/core';
import { Search } from 'lucide-vue-next';
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppSpinner from '@/components/ui/AppSpinner.vue';
import { usePermission } from '@/composables/usePermission';
import { type QuickAction, quickActions, useQuickActionsStore } from '@/features/quick-actions/actions';
import { searchProviders, type SearchResult } from './providers';
import { type RecentResult, useRecentResults } from './recent';

/**
 * Global search (Ctrl/⌘ K or "/"): one box over students, families, groups,
 * leads, employees and tasks. ↑/↓ move, Enter opens, Esc closes. Sections the
 * member cannot read are never queried.
 */
const open = defineModel<boolean>('open', { default: false });
const router = useRouter();
const { can } = usePermission();
const dialog = ref<HTMLDialogElement>();
const input = ref<HTMLInputElement>();
const term = ref('');
const loading = ref(false);
const groups = ref<{ key: string; results: SearchResult[] }[]>([]);
const active = ref(0);
let controller: AbortController | null = null;

const providers = computed(() => searchProviders.filter((provider) => can(provider.permission)));
const quick = useQuickActionsStore();
const recent = useRecentResults();
const searching = computed(() => term.value.trim().length >= 2);
const actions = computed(() => quickActions.filter((action) => can(action.permission)));

/**
 * One keyboard list for whatever is shown: search results, or (empty box)
 * quick actions followed by recently opened records.
 */
type Entry = { kind: 'result'; group: string; result: SearchResult } | { kind: 'action'; action: QuickAction };
const entries = computed<Entry[]>(() =>
  searching.value
    ? groups.value.flatMap((group) => group.results.map((result) => ({ kind: 'result' as const, group: group.key, result })))
    : [
        ...actions.value.map((action) => ({ kind: 'action' as const, action })),
        ...recent.items.value.map((item: RecentResult) => ({ kind: 'result' as const, group: item.group, result: item })),
      ],
);
const flat = computed(() => entries.value);
const iconOf = (key: string) => searchProviders.find((p) => p.key === key)?.icon;

useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement).tagName) || (event.target as HTMLElement).isContentEditable;
  if (((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing)) {
    event.preventDefault();
    open.value = true;
  }
});

watch(open, async (value) => {
  active.value = 0;
  const el = dialog.value;
  if (!el) return;
  if (value && !el.open) {
    el.showModal();
    await nextTick();
    input.value?.focus();
    input.value?.select();
  } else if (!value && el.open) {
    el.close();
  }
});

watchDebounced(
  term,
  async (value) => {
    controller?.abort();
    const query = value.trim();
    if (query.length < 2) {
      groups.value = [];
      loading.value = false;
      return;
    }
    controller = new AbortController();
    const { signal } = controller;
    loading.value = true;
    const settled = await Promise.allSettled(providers.value.map((provider) => provider.search(query, signal)));
    if (signal.aborted) return;
    groups.value = providers.value
      .map((provider, index) => {
        const outcome = settled[index];
        return { key: provider.key, results: outcome?.status === 'fulfilled' ? outcome.value : [] };
      })
      .filter((group) => group.results.length > 0);
    active.value = 0;
    loading.value = false;
  },
  { debounce: 200 },
);

async function go(entry: Entry | undefined): Promise<void> {
  if (!entry) return;
  open.value = false;
  term.value = '';
  if (entry.kind === 'action') {
    if (entry.action.dialog) quick.open(entry.action.dialog);
    else if (entry.action.to) await router.push(entry.action.to);
    return;
  }
  recent.remember({ ...entry.result, group: entry.group });
  await router.push(entry.result.to);
}

function onKeydown(event: KeyboardEvent): void {
  const count = flat.value.length;
  if (event.key === 'ArrowDown' && count) active.value = (active.value + 1) % count;
  else if (event.key === 'ArrowUp' && count) active.value = (active.value - 1 + count) % count;
  else if (event.key === 'Enter') void go(flat.value[active.value]);
  else return;
  event.preventDefault();
  void nextTick(() => dialog.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
}

const indexOf = (match: SearchResult | QuickAction) =>
  entries.value.findIndex((entry) => (entry.kind === 'action' ? entry.action === match : entry.result === match));
</script>

<template>
  <dialog
    ref="dialog"
    :aria-label="$t('search.title')"
    class="glass-strong m-0 mx-auto mt-[10dvh] w-[min(40rem,calc(100vw-2rem))] max-w-none rounded-3xl p-0 text-fg backdrop:bg-overlay"
    @close="open = false"
    @click="(e) => e.target === dialog && (open = false)"
  >
    <div class="flex items-center gap-3 border-b border-border px-4">
      <Search class="size-5 shrink-0 text-fg-subtle" aria-hidden="true" />
      <input
        ref="input"
        v-model="term"
        type="search"
        role="combobox"
        aria-expanded="true"
        aria-controls="search-results"
        :aria-activedescendant="flat.length ? `search-${active}` : undefined"
        :aria-label="$t('search.title')"
        :placeholder="$t('search.placeholder')"
        class="h-14 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden"
        @keydown="onKeydown"
      />
      <AppSpinner v-if="loading" size="sm" />
      <kbd class="hidden rounded-md border border-border px-1.5 py-0.5 text-xs text-fg-muted sm:block">Esc</kbd>
    </div>
    <div id="search-results" role="listbox" :aria-label="$t('search.results')" class="max-h-[60dvh] overflow-y-auto p-2">
      <template v-if="!searching">
        <div v-if="actions.length" role="group" :aria-label="$t('quick.title')" class="mb-2">
          <p class="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">{{ $t('quick.title') }}</p>
          <div
            v-for="action in actions"
            :id="`search-${indexOf(action)}`"
            :key="action.key"
            role="option"
            :aria-selected="indexOf(action) === active"
            class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5"
            :class="indexOf(action) === active ? 'bg-primary-soft' : 'hover:bg-surface-hover'"
            @mouseenter="active = indexOf(action)"
            @click="go({ kind: 'action', action })"
          >
            <component :is="action.icon" class="size-4.5 shrink-0 text-fg-subtle" aria-hidden="true" />
            <span class="text-sm font-medium text-fg">{{ $t(`quick.actions.${action.key}`) }}</span>
          </div>
        </div>
        <div v-if="recent.items.value.length" role="group" :aria-label="$t('search.recent')" class="mb-2">
          <p class="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">{{ $t('search.recent') }}</p>
          <div
            v-for="item in recent.items.value"
            :id="`search-${indexOf(item)}`"
            :key="`${item.group}-${item.id}`"
            role="option"
            :aria-selected="indexOf(item) === active"
            class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5"
            :class="indexOf(item) === active ? 'bg-primary-soft' : 'hover:bg-surface-hover'"
            @mouseenter="active = indexOf(item)"
            @click="go({ kind: 'result', group: item.group, result: item })"
          >
            <component :is="iconOf(item.group)" class="size-4.5 shrink-0 text-fg-subtle" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-fg">{{ item.title }}</span>
              <span v-if="item.subtitle" class="block truncate text-xs text-fg-muted">{{ item.subtitle }}</span>
            </span>
          </div>
        </div>
        <p class="px-3 py-4 text-center text-xs text-fg-muted">{{ $t('search.hint') }}</p>
      </template>
      <p v-else-if="!loading && groups.length === 0" class="px-3 py-6 text-center text-sm text-fg-muted">{{ $t('common.noMatches') }}</p>
      <div v-for="group in searching ? groups : []" :key="group.key" role="group" :aria-label="$t(`search.groups.${group.key}`)" class="mb-2">
        <p class="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">{{ $t(`search.groups.${group.key}`) }}</p>
        <div
          v-for="result in group.results"
          :id="`search-${indexOf(result)}`"
          :key="result.id"
          role="option"
          :aria-selected="indexOf(result) === active"
          class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5"
          :class="indexOf(result) === active ? 'bg-primary-soft' : 'hover:bg-surface-hover'"
          @mouseenter="active = indexOf(result)"
          @click="go({ kind: 'result', group: group.key, result })"
        >
          <component :is="iconOf(group.key)" class="size-4.5 shrink-0 text-fg-subtle" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-fg">{{ result.title }}</span>
            <span v-if="result.subtitle" class="block truncate text-xs text-fg-muted">{{ result.subtitle }}</span>
          </span>
        </div>
      </div>
    </div>
  </dialog>
</template>

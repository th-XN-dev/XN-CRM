<script setup lang="ts">
import { onClickOutside, watchDebounced } from '@vueuse/core';
import { Check, ChevronsUpDown, X } from 'lucide-vue-next';
import { computed, nextTick, ref, useId, watch } from 'vue';
import AppSpinner from '@/components/ui/AppSpinner.vue';
import { appConfig } from '@/app/config/app.config';

export interface PickerOption {
  value: string;
  label: string;
  description?: string;
  /** Shown but not selectable, with the reason as description (e.g. "Group is full"). */
  disabled?: boolean;
}

/**
 * Searchable single choice over an API list (students, groups, invoices…):
 * WAI-ARIA combobox — type to search, ↑/↓ to move, Enter to pick, Esc to close.
 * `model` is the id; `selected` keeps the chosen option for display.
 */
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  id?: string;
  search: (term: string) => Promise<PickerOption[]>;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  /** Label of the current value when it was set from outside (e.g. edit forms, deep links). */
  initialLabel?: string;
}>();
const model = defineModel<string>({ default: '' });
const emit = defineEmits<{ select: [option: PickerOption | null] }>();

const listId = useId();
const root = ref<HTMLElement>();
const input = ref<HTMLInputElement>();
const open = ref(false);
const term = ref('');
const options = ref<PickerOption[]>([]);
const loading = ref(false);
const failed = ref(false);
const active = ref(-1);
const selected = ref<PickerOption | null>(
  model.value && props.initialLabel ? { value: model.value, label: props.initialLabel } : null,
);
let requestId = 0;

watch(
  () => props.initialLabel,
  (label) => {
    if (label && model.value && selected.value?.value !== model.value) {
      selected.value = { value: model.value, label };
    }
  },
);
watch(model, (value) => {
  if (!value) selected.value = null;
});

async function load(): Promise<void> {
  const current = ++requestId;
  loading.value = true;
  failed.value = false;
  try {
    const result = await props.search(term.value.trim());
    if (current !== requestId) return; // a newer search already answered
    options.value = result;
    active.value = result.findIndex((option) => !option.disabled);
  } catch {
    if (current === requestId) failed.value = true;
  } finally {
    if (current === requestId) loading.value = false;
  }
}

watchDebounced(term, () => open.value && load(), { debounce: appConfig.searchDebounceMs });

function show(): void {
  if (props.disabled || open.value) return;
  open.value = true;
  void load();
}

function close(): void {
  open.value = false;
  term.value = '';
}

function pick(option: PickerOption): void {
  if (option.disabled) return;
  selected.value = option;
  model.value = option.value;
  emit('select', option);
  close();
  void nextTick(() => input.value?.focus());
}

function clear(): void {
  selected.value = null;
  model.value = '';
  emit('select', null);
  void nextTick(() => input.value?.focus());
}

function move(step: number): void {
  if (!open.value) return show();
  const count = options.value.length;
  if (count === 0) return;
  let next = active.value;
  for (let i = 0; i < count; i++) {
    next = (next + step + count) % count;
    if (!options.value[next]?.disabled) break;
  }
  active.value = next;
  void nextTick(() =>
    root.value?.querySelector(`#${CSS.escape(`${listId}-${next}`)}`)?.scrollIntoView({ block: 'nearest' }),
  );
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') move(1);
  else if (event.key === 'ArrowUp') move(-1);
  else if (event.key === 'Enter' && open.value) {
    const option = options.value[active.value];
    if (option) pick(option);
  } else if (event.key === 'Escape' && open.value) close();
  else return;
  event.preventDefault();
}

onClickOutside(root, close);

const display = computed(() => (open.value ? term.value : (selected.value?.label ?? '')));
const activeId = computed(() => (open.value && active.value >= 0 ? `${listId}-${active.value}` : undefined));
</script>

<template>
  <div ref="root" class="relative">
    <input
      :id="id"
      ref="input"
      v-bind="$attrs"
      type="text"
      role="combobox"
      autocomplete="off"
      :value="display"
      :placeholder="selected && !open ? undefined : (placeholder ?? $t('common.searchPlaceholder'))"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-controls="listId"
      aria-autocomplete="list"
      :aria-activedescendant="activeId"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      class="h-11 w-full rounded-xl border bg-surface pr-16 pl-3.5 text-base text-fg shadow-sm placeholder:text-fg-subtle focus:border-primary focus:ring-4 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-muted sm:h-10 sm:text-sm"
      :class="invalid ? 'border-danger' : 'border-border-strong'"
      @focus="show"
      @click="show"
      @input="term = ($event.target as HTMLInputElement).value"
      @keydown="onKeydown"
    />
    <div class="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
      <AppSpinner v-if="loading && open" size="sm" />
      <button
        v-else-if="selected && !disabled"
        type="button"
        class="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover"
        :aria-label="$t('common.clear')"
        @click="clear"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
      <ChevronsUpDown class="pointer-events-none mr-1.5 size-4 text-fg-subtle" aria-hidden="true" />
    </div>

    <ul
      v-show="open"
      :id="listId"
      role="listbox"
      class="glass-strong absolute z-50 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl p-1"
    >
      <li v-if="failed" class="px-3 py-2.5 text-sm text-danger">{{ $t('states.errorTitle') }}</li>
      <li v-else-if="!loading && options.length === 0" class="px-3 py-2.5 text-sm text-fg-muted">
        {{ $t('common.noMatches') }}
      </li>
      <li
        v-for="(option, index) in options"
        :id="`${listId}-${index}`"
        :key="option.value"
        role="option"
        :aria-selected="option.value === model"
        :aria-disabled="option.disabled || undefined"
        class="flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm"
        :class="[
          index === active && 'bg-surface-hover',
          option.disabled ? 'cursor-not-allowed opacity-55' : 'hover:bg-surface-hover',
        ]"
        @mousedown.prevent
        @mouseenter="!option.disabled && (active = index)"
        @click="pick(option)"
      >
        <span class="min-w-0 flex-1">
          <span class="block truncate text-fg">{{ option.label }}</span>
          <span v-if="option.description" class="block truncate text-xs text-fg-muted">{{ option.description }}</span>
        </span>
        <Check v-if="option.value === model" class="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

export interface TabItem {
  key: string;
  label: string;
}

/** Tabs with roving focus: ←/→ move and select, Home/End jump. */
defineProps<{ tabs: readonly TabItem[]; label: string }>();
const model = defineModel<string>({ required: true });
const list = ref<HTMLElement>();

function onKeydown(event: KeyboardEvent, index: number, tabs: readonly TabItem[]): void {
  const targets: Record<string, number> = {
    ArrowRight: index + 1,
    ArrowLeft: index - 1,
    Home: 0,
    End: tabs.length - 1,
  };
  const to = targets[event.key];
  if (to === undefined) return;
  event.preventDefault();
  const next = tabs[(to + tabs.length) % tabs.length];
  if (!next) return;
  model.value = next.key;
  list.value?.querySelector<HTMLElement>(`[data-tab="${next.key}"]`)?.focus();
}
</script>

<template>
  <div
    ref="list"
    role="tablist"
    :aria-label="label"
    class="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-muted p-1"
  >
    <button
      v-for="(tab, index) in tabs"
      :key="tab.key"
      type="button"
      role="tab"
      :data-tab="tab.key"
      :aria-selected="model === tab.key"
      :tabindex="model === tab.key ? 0 : -1"
      class="focus-ring h-9 shrink-0 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors"
      :class="model === tab.key ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'"
      @click="model = tab.key"
      @keydown="onKeydown($event, index, tabs)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

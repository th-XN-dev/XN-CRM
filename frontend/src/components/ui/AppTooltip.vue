<script setup lang="ts">
import { ref, useId } from 'vue';

/** Supplementary hint on hover/focus. Never put essential information only here. */
withDefaults(defineProps<{ text: string; side?: 'top' | 'bottom' | 'right' }>(), { side: 'top' });
const visible = ref(false);
const id = useId();
</script>

<template>
  <span
    class="relative inline-flex"
    @mouseenter="visible = true"
    @mouseleave="visible = false"
    @focusin="visible = true"
    @focusout="visible = false"
    @keydown.esc="visible = false"
  >
    <slot :describedby="id" />
    <span
      :id="id"
      role="tooltip"
      class="pointer-events-none absolute z-50 rounded-lg bg-fg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-bg shadow-lg transition-opacity"
      :class="[
        visible ? 'opacity-100' : 'opacity-0',
        side === 'top' && 'bottom-full left-1/2 mb-2 -translate-x-1/2',
        side === 'bottom' && 'top-full left-1/2 mt-2 -translate-x-1/2',
        side === 'right' && 'top-1/2 left-full ml-2 -translate-y-1/2',
      ]"
    >
      {{ text }}
    </span>
  </span>
</template>

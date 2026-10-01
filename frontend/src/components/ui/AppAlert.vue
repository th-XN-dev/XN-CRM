<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-vue-next';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

/**
 * An inline message inside a page or form (not a toast): it stays until the
 * situation changes. `danger` is announced immediately (role="alert").
 */
withDefaults(defineProps<{ tone?: AlertTone; title?: string }>(), { tone: 'info' });
const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };
const tones = {
  info: 'bg-info-soft [&_svg]:text-info',
  success: 'bg-success-soft [&_svg]:text-success',
  warning: 'bg-warning-soft [&_svg]:text-warning',
  danger: 'bg-danger-soft text-danger [&_svg]:text-danger',
};
</script>

<template>
  <div :role="tone === 'danger' ? 'alert' : 'status'" class="flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm text-fg" :class="tones[tone]">
    <component :is="icons[tone]" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p v-if="title" class="font-semibold">{{ title }}</p>
      <slot />
    </div>
  </div>
</template>

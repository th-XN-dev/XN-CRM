<script setup lang="ts">
export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
withDefaults(defineProps<{ tone?: BadgeTone; dot?: boolean }>(), { tone: 'neutral' });

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-fg-muted ring-border',
  brand: 'bg-primary-soft text-primary-soft-fg ring-transparent',
  success: 'bg-success-soft text-success ring-transparent',
  warning: 'bg-warning-soft text-warning ring-transparent',
  danger: 'bg-danger-soft text-danger ring-transparent',
  info: 'bg-info-soft text-info ring-transparent',
};
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset"
    :class="tones[tone]"
  >
    <span v-if="dot" class="size-1.5 rounded-full bg-current" aria-hidden="true" />
    <slot />
  </span>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

/** One headline number (same look as the dashboard's key figures). */
defineProps<{ icon: Component; label: string; value: string; hint?: string; to?: RouteLocationRaw; tone?: 'danger' | 'warning' }>();
const tones = { danger: 'text-danger', warning: 'text-warning' } as const;
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'div'"
    :to="to"
    class="flex w-full flex-col gap-1 rounded-2xl border border-border bg-surface p-4 shadow-card"
    :class="to && 'focus-ring transition-colors hover:border-primary'"
  >
    <span class="flex items-center gap-2 text-xs font-medium text-fg-muted"><component :is="icon" class="size-4" aria-hidden="true" />{{ label }}</span>
    <span class="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl" :class="tone ? tones[tone] : 'text-fg'">{{ value }}</span>
    <span v-if="hint" class="text-xs text-fg-muted">{{ hint }}</span>
  </component>
</template>

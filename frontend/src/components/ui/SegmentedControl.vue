<script setup lang="ts">
import type { Component } from 'vue';

export interface SegmentOption {
  value: string;
  label: string;
  icon?: Component;
}

/** Small single-choice control (theme, language, period) — a radio group. */
defineProps<{ options: readonly SegmentOption[]; label: string; name: string; iconOnly?: boolean }>();
const model = defineModel<string>({ required: true });
</script>

<template>
  <fieldset class="inline-flex max-w-full rounded-xl bg-surface-muted p-1">
    <legend class="sr-only">{{ label }}</legend>
    <label
      v-for="option in options"
      :key="option.value"
      class="relative flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
      :class="model === option.value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'"
    >
      <input v-model="model" type="radio" class="sr-only" :name="name" :value="option.value" />
      <component :is="option.icon" v-if="option.icon" class="size-4" aria-hidden="true" />
      <span :class="iconOnly && option.icon && 'sr-only'">{{ option.label }}</span>
    </label>
  </fieldset>
</template>

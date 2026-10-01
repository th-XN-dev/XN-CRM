<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
import { RouterLink, type RouteLocationRaw } from 'vue-router';

/** Top of a record page: back to the list, name, key facts, actions. */
defineProps<{ title: string; subtitle?: string; back: RouteLocationRaw; backLabel: string }>();
</script>

<template>
  <div class="mb-6">
    <RouterLink
      :to="back"
      class="focus-ring mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg text-sm font-medium text-fg-muted hover:text-fg"
    >
      <ArrowLeft class="size-4" aria-hidden="true" />
      {{ backLabel }}
    </RouterLink>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex min-w-0 items-start gap-4">
        <slot name="leading" />
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight break-words text-fg sm:text-3xl">{{ title }}</h1>
          <p v-if="subtitle" class="mt-1 text-sm text-fg-muted">{{ subtitle }}</p>
          <div v-if="$slots.badges" class="mt-2 flex flex-wrap items-center gap-2"><slot name="badges" /></div>
        </div>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap gap-2 sm:justify-end"><slot name="actions" /></div>
    </div>
  </div>
</template>

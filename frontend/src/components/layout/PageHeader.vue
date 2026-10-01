<script setup lang="ts">
/** Page title + description; primary actions sit on the right (desktop) or below (phone). */
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{{ title }}</h1>
      <p v-if="description" class="mt-1 text-sm text-fg-muted">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap gap-2"><slot name="actions" /></div>
  </div>
</template>

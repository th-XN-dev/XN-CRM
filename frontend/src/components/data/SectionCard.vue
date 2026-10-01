<script setup lang="ts">
/** A titled block on a record page (Profile, Students, Finance…). */
defineProps<{ title?: string; description?: string; flush?: boolean }>();
</script>

<template>
  <section class="rounded-2xl border border-border bg-surface shadow-card">
    <header v-if="title || $slots.actions" class="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div class="min-w-0">
        <h2 v-if="title" class="text-base font-semibold text-fg">{{ title }}</h2>
        <p v-if="description" class="mt-0.5 text-sm text-fg-muted">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 gap-2"><slot name="actions" /></div>
    </header>
    <div :class="flush ? '' : 'px-5 pb-5'" class="[&:first-child]:pt-5"><slot /></div>
  </section>
</template>

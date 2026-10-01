<script setup lang="ts">
/** Skeletons keep the layout stable while data loads (no jumping content). */
withDefaults(defineProps<{ variant?: 'cards' | 'list' | 'page'; count?: number }>(), {
  variant: 'list',
  count: 4,
});
</script>

<template>
  <div role="status" :aria-label="$t('states.loading')" aria-busy="true">
    <div v-if="variant === 'cards'" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div v-for="i in count" :key="i" class="h-28 animate-pulse rounded-2xl bg-surface-muted" />
    </div>
    <div v-else-if="variant === 'page'" class="space-y-4">
      <div class="h-8 w-1/3 animate-pulse rounded-lg bg-surface-muted" />
      <div class="h-40 animate-pulse rounded-2xl bg-surface-muted" />
      <div class="h-40 animate-pulse rounded-2xl bg-surface-muted" />
    </div>
    <div v-else class="space-y-2">
      <div v-for="i in count" :key="i" class="h-14 animate-pulse rounded-xl bg-surface-muted" />
    </div>
  </div>
</template>

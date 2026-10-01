<script setup lang="ts">
import AppCard from '@/components/ui/AppCard.vue';

defineProps<{ title: string; description?: string }>();
</script>

<template>
  <AppCard>
    <h2 class="text-lg font-semibold text-fg">{{ title }}</h2>
    <p v-if="description" class="mt-1 text-sm text-fg-muted">{{ description }}</p>
    <div class="mt-6"><slot /></div>
  </AppCard>
</template>

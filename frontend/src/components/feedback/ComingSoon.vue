<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next';
import AppCard from '@/components/ui/AppCard.vue';
import EmptyState from './EmptyState.vue';

/** Placeholder for sections arriving in the next release (routes and access already work). */
defineProps<{ name: string }>();
</script>

<template>
  <AppCard>
    <EmptyState :icon="Sparkles" :title="$t('feature.placeholderTitle', { name })" :text="$t('feature.placeholderText')" />
  </AppCard>
</template>

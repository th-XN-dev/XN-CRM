<script setup lang="ts">
import EmptyState from './EmptyState.vue';
import ErrorState from './ErrorState.vue';
import LoadingState from './LoadingState.vue';

/**
 * The standard wrapper for data-driven content: Loading → Error (network,
 * 401, 403, other) → Empty → content. Pages never hand-roll these states.
 */
defineProps<{
  loading: boolean;
  error?: unknown;
  empty?: boolean;
  loadingVariant?: 'cards' | 'list' | 'page';
  emptyTitle?: string;
  emptyText?: string;
}>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <LoadingState v-if="loading" :variant="loadingVariant" />
  <ErrorState v-else-if="error" :error="error" @retry="$emit('retry')" />
  <EmptyState v-else-if="empty" :title="emptyTitle" :text="emptyText"><slot name="empty" /></EmptyState>
  <slot v-else />
</template>

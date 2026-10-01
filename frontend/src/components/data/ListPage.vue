<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import AppButton from '@/components/ui/AppButton.vue';
import AppPagination from '@/components/ui/AppPagination.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import type { PaginationMeta } from '@/types/api';

/**
 * Loading / error / empty / table + pagination for a paginated list. While a
 * new page loads the previous rows stay (dimmed) instead of flashing a spinner.
 */
defineProps<{
  loading: boolean;
  fetching?: boolean;
  error?: unknown;
  meta?: PaginationMeta;
  emptyTitle?: string;
  emptyText?: string;
  /** Content brings its own layout (e.g. a card grid): no table frame. */
  plain?: boolean;
  /** Empty and unfiltered → offer the first step ("Create student"). Omit when filtered or not permitted. */
  createLabel?: string;
}>();
const page = defineModel<number>('page', { default: 1 });
defineEmits<{ retry: []; create: [] }>();
</script>

<template>
  <QueryState
    :loading="loading && !meta"
    :error="meta ? undefined : error"
    :empty="meta?.total === 0"
    loading-variant="list"
    :empty-title="emptyTitle"
    :empty-text="emptyText"
    @retry="$emit('retry')"
  >
    <template #empty>
      <slot name="empty">
        <AppButton v-if="createLabel" :icon="Plus" @click="$emit('create')">{{ createLabel }}</AppButton>
      </slot>
    </template>
    <div :class="!plain && 'rounded-2xl md:border md:border-border md:bg-surface md:shadow-card'">
      <slot />
    </div>
    <AppPagination v-if="meta && meta.totalPages > 1" v-model="page" :meta="meta" class="mt-4" />
  </QueryState>
</template>

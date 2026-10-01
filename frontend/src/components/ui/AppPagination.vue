<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { computed } from 'vue';
import type { PaginationMeta } from '@/types/api';
import AppButton from './AppButton.vue';

const props = defineProps<{ meta: PaginationMeta }>();
const page = defineModel<number>({ required: true });
const from = computed(() => (props.meta.total === 0 ? 0 : (props.meta.page - 1) * props.meta.limit + 1));
const to = computed(() => Math.min(props.meta.page * props.meta.limit, props.meta.total));
</script>

<template>
  <nav :aria-label="$t('pagination.label')" class="flex items-center justify-between gap-3">
    <p class="text-sm text-fg-muted" aria-live="polite">
      {{ $t('pagination.summary', { from, to, total: meta.total }) }}
    </p>
    <div class="flex items-center gap-2">
      <AppButton
        variant="secondary"
        icon-only
        :icon="ChevronLeft"
        :label="$t('pagination.previous')"
        :disabled="meta.page <= 1"
        @click="page = meta.page - 1"
      />
      <span class="text-sm text-fg-muted tabular-nums">
        {{ $t('pagination.page', { page: meta.page, pages: Math.max(meta.totalPages, 1) }) }}
      </span>
      <AppButton
        variant="secondary"
        icon-only
        :icon="ChevronRight"
        :label="$t('pagination.next')"
        :disabled="meta.page >= meta.totalPages"
        @click="page = meta.page + 1"
      />
    </div>
  </nav>
</template>

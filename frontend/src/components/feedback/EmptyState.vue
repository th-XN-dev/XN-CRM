<script setup lang="ts">
import { Inbox } from 'lucide-vue-next';
import type { Component } from 'vue';

defineProps<{ title?: string; text?: string; icon?: Component; compact?: boolean }>();
</script>

<template>
  <div class="flex flex-col items-center text-center" :class="compact ? 'py-8' : 'py-14 sm:py-20'">
    <div class="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-fg">
      <component :is="icon ?? Inbox" class="size-7" aria-hidden="true" />
    </div>
    <h2 class="text-base font-semibold text-fg">{{ title ?? $t('states.emptyTitle') }}</h2>
    <p class="mt-1 max-w-sm text-sm text-fg-muted">{{ text ?? $t('states.emptyText') }}</p>
    <div v-if="$slots.default" class="mt-6 flex flex-col gap-2 sm:flex-row"><slot /></div>
  </div>
</template>

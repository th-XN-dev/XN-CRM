<script setup lang="ts">
export interface InfoItem {
  key: string;
  label: string;
  value?: string | number | null;
}

/** Label / value pairs of a record. Empty values show a dash; `#item-<key>` overrides a value. */
defineProps<{ items: readonly InfoItem[]; columns?: 1 | 2 }>();
</script>

<template>
  <dl class="grid gap-x-6 gap-y-4" :class="columns === 2 ? 'sm:grid-cols-2' : ''">
    <div v-for="item in items" :key="item.key" class="min-w-0">
      <dt class="text-xs font-medium text-fg-muted">{{ item.label }}</dt>
      <dd class="mt-0.5 text-sm break-words text-fg">
        <slot :name="`item-${item.key}`">{{ item.value === null || item.value === undefined || item.value === '' ? '—' : item.value }}</slot>
      </dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: string | number; tone?: 'danger' | 'warning' | 'success' }>();
const tones = { danger: 'text-danger', warning: 'text-warning', success: 'text-success' } as const;
</script>

<template>
  <div class="min-w-0">
    <dt class="truncate text-xs text-fg-muted">{{ label }}</dt>
    <dd class="font-semibold tabular-nums" :class="tone ? tones[tone] : 'text-fg'">{{ value }}</dd>
  </div>
</template>

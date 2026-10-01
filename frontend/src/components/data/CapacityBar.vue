<script setup lang="ts">
import { computed } from 'vue';

/** "12 / 15" with a bar: amber from 80 %, red when full. */
const props = defineProps<{ used: number; total: number; compact?: boolean }>();
const ratio = computed(() => (props.total > 0 ? Math.min(props.used / props.total, 1) : 0));
const tone = computed(() => (ratio.value >= 1 ? 'bg-danger' : ratio.value >= 0.8 ? 'bg-warning' : 'bg-success'));
</script>

<template>
  <div class="flex items-center gap-2" :class="compact ? 'min-w-24' : 'min-w-32'">
    <div
      class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
      role="meter"
      :aria-valuenow="used"
      :aria-valuemin="0"
      :aria-valuemax="total"
      :aria-label="$t('groups.capacityLabel', { used, total })"
    >
      <div class="h-full rounded-full transition-[width]" :class="tone" :style="{ width: `${ratio * 100}%` }" />
    </div>
    <span class="text-xs whitespace-nowrap text-fg-muted tabular-nums">{{ used }} / {{ total }}</span>
  </div>
</template>

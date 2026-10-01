<script setup lang="ts">
import { computed } from 'vue';
import { useFormatters } from '@/composables/useFormatters';

/** Rate first (the number people act on), then the four counts. */
const props = defineProps<{
  rate: number | null;
  present: number;
  absent: number;
  late: number;
  excused: number;
  lessons: number;
}>();
const format = useFormatters();
const tone = computed(() =>
  props.rate === null ? 'text-fg' : props.rate >= 85 ? 'text-success' : props.rate >= 70 ? 'text-warning' : 'text-danger',
);
const cells = computed(() => [
  { key: 'PRESENT', value: props.present, dot: 'bg-success' },
  { key: 'ABSENT', value: props.absent, dot: 'bg-danger' },
  { key: 'LATE', value: props.late, dot: 'bg-warning' },
  { key: 'EXCUSED', value: props.excused, dot: 'bg-info' },
]);
</script>

<template>
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
    <div class="shrink-0 sm:w-40">
      <p class="text-xs font-medium text-fg-muted">{{ $t('attendance.rate') }}</p>
      <p class="text-3xl font-semibold tabular-nums" :class="tone">{{ rate === null ? '—' : format.percent(rate) }}</p>
      <p class="text-xs text-fg-muted">{{ $t('attendance.lessons', { count: lessons }, lessons) }}</p>
    </div>
    <dl class="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
      <div v-for="cell in cells" :key="cell.key" class="rounded-xl bg-surface-muted px-3 py-2.5">
        <dt class="flex items-center gap-1.5 text-xs text-fg-muted">
          <span class="size-2 rounded-full" :class="cell.dot" aria-hidden="true" />{{ $t(`status.attendance.${cell.key}`) }}
        </dt>
        <dd class="mt-0.5 text-lg font-semibold text-fg tabular-nums">{{ cell.value }}</dd>
      </div>
    </dl>
  </div>
</template>

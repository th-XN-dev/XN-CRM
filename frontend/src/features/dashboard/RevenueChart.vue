<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFormatters } from '@/composables/useFormatters';
import type { RevenuePointDto } from '@/services/api/schema.gen';

/**
 * Money received per day (or month): one series, one hue (the brand), thin
 * bars anchored to the baseline. Hover/focus shows the exact value; the same
 * numbers are in a table for screen readers. No legend — the title names it.
 */
const props = defineProps<{ series: readonly RevenuePointDto[]; granularity: 'day' | 'month'; title: string }>();
const format = useFormatters();
const active = ref<number | null>(null);

const WIDTH = 640;
const HEIGHT = 160;
const GAP = 2;
const max = computed(() => Math.max(1, ...props.series.map((p) => Number(p.net))));
const barWidth = computed(() => Math.max(WIDTH / Math.max(props.series.length, 1) - GAP, 1));
const bars = computed(() =>
  props.series.map((point, index) => {
    const value = Math.max(Number(point.net), 0);
    const height = value === 0 ? 0 : Math.max((value / max.value) * HEIGHT, 3);
    return { point, x: index * (barWidth.value + GAP), height, y: HEIGHT - height };
  }),
);
const label = (bucket: string) => (props.granularity === 'month' ? format.dayShort(bucket).replace(/^\d+-?\s*/, '') : format.dayShort(bucket));
const tooltip = computed(() => (active.value === null ? null : bars.value[active.value] ?? null));
const ticks = computed(() => {
  const count = props.series.length;
  if (count === 0) return [];
  const step = Math.ceil(count / 6);
  return props.series.map((p, i) => ({ i, label: label(p.bucket) })).filter(({ i }) => i % step === 0);
});
</script>

<template>
  <figure class="relative">
    <figcaption class="sr-only">{{ title }}</figcaption>
    <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="h-40 w-full" preserveAspectRatio="none" role="img" :aria-label="title" @mouseleave="active = null">
      <line :x1="0" :x2="WIDTH" :y1="HEIGHT" :y2="HEIGHT" class="stroke-border" stroke-width="1" vector-effect="non-scaling-stroke" />
      <g v-for="(bar, index) in bars" :key="bar.point.bucket">
        <!-- Hit target: the whole column, bigger than the bar. -->
        <rect :x="bar.x" y="0" :width="barWidth + GAP" :height="HEIGHT" fill="transparent" @mouseenter="active = index" />
        <rect
          v-if="bar.height > 0"
          :x="bar.x"
          :y="bar.y"
          :width="barWidth"
          :height="bar.height"
          :rx="Math.min(4, barWidth / 2)"
          class="pointer-events-none fill-primary transition-opacity"
          :class="active !== null && active !== index && 'opacity-50'"
        />
      </g>
    </svg>
    <div class="relative mt-1 h-4 text-[11px] text-fg-muted" aria-hidden="true">
      <span v-for="tick in ticks" :key="tick.i" class="absolute whitespace-nowrap" :style="{ left: `${((tick.i * (barWidth + GAP)) / WIDTH) * 100}%` }">{{ tick.label }}</span>
    </div>
    <div
      v-if="tooltip"
      class="glass-strong pointer-events-none absolute top-0 z-10 rounded-xl px-3 py-2 text-xs shadow-lg"
      :style="{ left: `min(${(tooltip.x / WIDTH) * 100}%, calc(100% - 10rem))` }"
    >
      <p class="text-fg-muted">{{ granularity === 'month' ? label(tooltip.point.bucket) : format.day(tooltip.point.bucket) }}</p>
      <p class="font-semibold text-fg tabular-nums">{{ format.money(tooltip.point.net) }}</p>
      <p class="text-fg-muted">{{ $t('dashboard.chart.payments', { count: tooltip.point.payments }, tooltip.point.payments) }}</p>
    </div>
    <table class="sr-only">
      <caption>{{ title }}</caption>
      <thead><tr><th scope="col">{{ $t('common.date') }}</th><th scope="col">{{ $t('common.amount') }}</th></tr></thead>
      <tbody>
        <tr v-for="point in series" :key="point.bucket"><td>{{ format.day(point.bucket) }}</td><td>{{ format.money(point.net) }}</td></tr>
      </tbody>
    </table>
  </figure>
</template>

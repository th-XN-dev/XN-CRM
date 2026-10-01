<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RouteLocationRaw } from 'vue-router';
import type { StatusKind } from '@/app/config/statuses';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useFormatters } from '@/composables/useFormatters';
import type { UnitMetricsDto } from '@/services/api/schema.gen';

export interface ComparisonRow {
  id: string;
  name: string;
  hint?: string;
  to?: RouteLocationRaw;
  badge?: { kind: StatusKind; value: string };
  metrics: UnitMetricsDto;
}

type MetricKey = 'activeStudents' | 'newStudents' | 'revenue' | 'debt' | 'attendanceRate' | 'newLeads' | 'conversionRate';

/**
 * Units (centers, sub-centers, branches) side by side: one metric as bars,
 * every metric in the table. Numbers only — no "best/worst" verdicts.
 */
const props = defineProps<{ rows: readonly ComparisonRow[]; caption: string; currency?: string; columnsId?: string }>();
const { t } = useI18n();
const format = useFormatters();
const metric = ref<MetricKey>('activeStudents');
const selectId = useId();

const metricOptions = computed(() =>
  (
    [
      ['activeStudents', 'metrics.activeStudents'],
      ['newStudents', 'metrics.newStudents'],
      ['revenue', 'metrics.revenue'],
      ['debt', 'metrics.debt'],
      ['attendanceRate', 'metrics.attendance'],
      ['newLeads', 'metrics.leads'],
      ['conversionRate', 'metrics.conversion'],
    ] as const
  ).map(([value, key]) => ({ value, label: t(key) })),
);

const numeric = (m: UnitMetricsDto, key: MetricKey) => Number(m[key]);
const display = (m: UnitMetricsDto, key: MetricKey): string => {
  if (key === 'revenue' || key === 'debt') return format.money(m[key], props.currency);
  if (key === 'attendanceRate' || key === 'conversionRate') return format.percent(m[key]);
  return format.number(m[key]);
};
const bars = computed(() => {
  const rows = [...props.rows].sort((a, b) => numeric(b.metrics, metric.value) - numeric(a.metrics, metric.value));
  const max = Math.max(1, ...rows.map((row) => Math.abs(numeric(row.metrics, metric.value))));
  const total = rows.reduce((sum, row) => sum + numeric(row.metrics, metric.value), 0);
  const additive = metric.value !== 'attendanceRate' && metric.value !== 'conversionRate';
  return rows.map((row) => {
    const value = numeric(row.metrics, metric.value);
    return {
      row,
      width: `${Math.max(0, (value / max) * 100)}%`,
      label: display(row.metrics, metric.value),
      share: additive && total > 0 ? format.percent((value / total) * 100) : null,
    };
  });
});

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: props.caption },
  { key: 'activeStudents', label: t('metrics.activeStudents'), align: 'right' },
  { key: 'newStudents', label: t('metrics.newStudents'), align: 'right' },
  { key: 'growth', label: t('metrics.growth'), align: 'right', wide: true },
  { key: 'attendance', label: t('metrics.attendance'), align: 'right' },
  { key: 'revenue', label: t('metrics.revenue'), align: 'right' },
  { key: 'debt', label: t('metrics.debt'), align: 'right' },
  { key: 'leads', label: t('metrics.leads'), align: 'right', wide: true },
  { key: 'conversion', label: t('metrics.conversion'), align: 'right', wide: true },
]);
const growth = (m: UnitMetricsDto) =>
  m.growthRate === null ? t('metrics.noBase') : `${m.growthRate > 0 ? '+' : ''}${format.percent(m.growthRate)}`;
</script>

<template>
  <div class="flex flex-col gap-5">
    <div v-if="rows.length > 1" class="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label :for="selectId" class="text-sm font-medium text-fg">{{ $t('metrics.compareBy') }}</label>
        <AppSelect :id="selectId" v-model="metric" :options="metricOptions" class="w-56" />
      </div>
      <ul class="flex flex-col gap-2.5">
        <li v-for="bar in bars" :key="bar.row.id" class="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span class="truncate text-fg">{{ bar.row.name }}</span>
          <span class="h-2.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
            <span class="block h-full rounded-full bg-primary transition-[width]" :style="{ width: bar.width }" />
          </span>
          <span class="text-right tabular-nums text-fg">
            {{ bar.label }}<span v-if="bar.share" class="ml-1.5 text-xs text-fg-muted">({{ bar.share }})</span>
          </span>
        </li>
      </ul>
    </div>

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row: ComparisonRow) => row.id"
      :row-to="rows.length && rows.every((row) => row.to) ? (row: ComparisonRow) => row.to! : undefined"
      :caption="caption"
      :columns-id="columnsId"
    >
      <template #cell-name="{ row }">
        <span class="flex min-w-0 items-center gap-2">
          <span class="truncate font-medium">{{ row.name }}</span>
          <StatusBadge v-if="row.badge" :kind="row.badge.kind" :value="row.badge.value" />
        </span>
        <span v-if="row.hint" class="block truncate text-xs text-fg-muted">{{ row.hint }}</span>
      </template>
      <template #cell-activeStudents="{ row }">{{ format.number(row.metrics.activeStudents) }}</template>
      <template #cell-newStudents="{ row }">{{ format.number(row.metrics.newStudents) }}</template>
      <template #cell-growth="{ row }">
        <span :class="row.metrics.growthRate === null ? 'text-fg-subtle' : row.metrics.growthRate < 0 ? 'text-danger' : 'text-success'">{{ growth(row.metrics) }}</span>
      </template>
      <template #cell-attendance="{ row }">{{ row.metrics.attendanceMarks ? format.percent(row.metrics.attendanceRate) : '—' }}</template>
      <template #cell-revenue="{ row }">{{ format.money(row.metrics.revenue, currency) }}</template>
      <template #cell-debt="{ row }"><span :class="Number(row.metrics.debt) > 0 && 'text-warning'">{{ format.money(row.metrics.debt, currency) }}</span></template>
      <template #cell-leads="{ row }">{{ format.number(row.metrics.newLeads) }}</template>
      <template #cell-conversion="{ row }">{{ row.metrics.newLeads ? format.percent(row.metrics.conversionRate) : '—' }}</template>
      <template #mobile="{ row }">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-medium text-fg">{{ row.name }}</p>
            <p class="text-sm text-fg-muted">
              {{ format.number(row.metrics.activeStudents) }} · {{ format.money(row.metrics.revenue, currency) }}
            </p>
            <p v-if="Number(row.metrics.debt) > 0" class="text-xs text-warning">{{ $t('metrics.debt') }}: {{ format.money(row.metrics.debt, currency) }}</p>
          </div>
          <StatusBadge v-if="row.badge" :kind="row.badge.kind" :value="row.badge.value" />
        </div>
      </template>
    </DataTable>
  </div>
</template>

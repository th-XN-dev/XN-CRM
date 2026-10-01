<script setup lang="ts">
import { CalendarCheck, GraduationCap, HandCoins, Magnet, TrendingUp, Wallet } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormatters } from '@/composables/useFormatters';
import type { UnitMetricsDto } from '@/services/api/schema.gen';
import KpiTile from './KpiTile.vue';

/** The headline numbers of one unit (platform, center, sub-center) for a period. */
const props = defineProps<{ metrics: UnitMetricsDto; period: string; currency?: string }>();
const { t } = useI18n();
const format = useFormatters();
const growth = computed(() =>
  props.metrics.growthRate === null ? t('metrics.noBase') : `${props.metrics.growthRate > 0 ? '+' : ''}${format.percent(props.metrics.growthRate)}`,
);
const tiles = computed(() => [
  { key: 'students', icon: GraduationCap, label: t('metrics.activeStudents'), value: format.number(props.metrics.activeStudents), hint: t('dashboard.kpi.newStudents', { count: props.metrics.newStudents }) },
  { key: 'growth', icon: TrendingUp, label: t('metrics.growth'), value: growth.value, hint: t('metrics.growthHint') },
  { key: 'revenue', icon: HandCoins, label: `${t('metrics.revenue')}, ${props.period}`, value: format.money(props.metrics.revenue, props.currency), hint: t('metrics.revenueHint') },
  {
    key: 'debt',
    icon: Wallet,
    label: t('metrics.debt'),
    value: format.money(props.metrics.debt, props.currency),
    tone: Number(props.metrics.debt) > 0 ? ('warning' as const) : undefined,
  },
  { key: 'attendance', icon: CalendarCheck, label: t('metrics.attendance'), value: props.metrics.attendanceMarks ? format.percent(props.metrics.attendanceRate) : '—' },
  { key: 'leads', icon: Magnet, label: t('metrics.leads'), value: format.number(props.metrics.newLeads), hint: t('dashboard.kpi.conversion', { rate: format.percent(props.metrics.conversionRate) }) },
]);
</script>

<template>
  <ul class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
    <li v-for="tile in tiles" :key="tile.key" class="flex">
      <KpiTile :icon="tile.icon" :label="tile.label" :value="tile.value" :hint="tile.hint" :tone="tile.tone" />
    </li>
  </ul>
</template>

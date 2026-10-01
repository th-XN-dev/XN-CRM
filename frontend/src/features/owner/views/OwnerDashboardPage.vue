<script setup lang="ts">
import { Building2, CalendarClock, GraduationCap, HandCoins, Magnet, Plus, Snowflake, UsersRound, Wallet } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppAlert from '@/components/ui/AppAlert.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useFormatters } from '@/composables/useFormatters';
import KpiTile from '@/features/analytics/components/KpiTile.vue';
import MetricsComparison, { type ComparisonRow } from '@/features/analytics/components/MetricsComparison.vue';
import PeriodBar from '@/features/analytics/components/PeriodBar.vue';
import { usePeriodFilter } from '@/features/analytics/usePeriodFilter';
import { addDays, orgDay } from '@/lib/dates';
import { useAuthStore } from '@/stores/auth.store';
import { useOwnerAnalytics } from '../api';

const { t } = useI18n();
const auth = useAuthStore();
const format = useFormatters();
const filter = usePeriodFilter({});
const analytics = useOwnerAnalytics(filter.params);
const data = computed(() => analytics.data.value);
/** One currency → money is shown in it; several → plain sums with a note. */
const currency = computed(() => (data.value?.currencies.length === 1 ? data.value.currencies[0] : undefined));

const kpis = computed(() => {
  const d = data.value;
  if (!d) return [];
  return [
    { key: 'centers', icon: Building2, label: t('owner.dashboard.centers'), value: format.number(d.centers.total), hint: `${format.number(d.centers.active)} ${t('owner.dashboard.active')}`, to: '/owner/centers' },
    { key: 'frozen', icon: Snowflake, label: t('owner.dashboard.frozen'), value: format.number(d.centers.frozen), hint: d.centers.outOfPeriod ? `${t('owner.dashboard.outOfPeriod')}: ${d.centers.outOfPeriod}` : undefined, to: { path: '/owner/centers', query: { status: 'FROZEN' } }, tone: d.centers.frozen ? ('warning' as const) : undefined },
    { key: 'users', icon: UsersRound, label: t('owner.dashboard.users'), value: format.number(d.users) },
    { key: 'students', icon: GraduationCap, label: t('owner.dashboard.students'), value: format.number(d.totals.activeStudents), hint: t('dashboard.kpi.newStudents', { count: d.totals.newStudents }) },
    { key: 'revenue', icon: HandCoins, label: t('owner.dashboard.revenue', { period: filter.label.value }), value: format.money(d.totals.revenue, currency.value) },
    { key: 'debt', icon: Wallet, label: t('owner.dashboard.debt'), value: format.money(d.totals.debt, currency.value), tone: Number(d.totals.debt) > 0 ? ('warning' as const) : undefined },
    { key: 'leads', icon: Magnet, label: t('owner.dashboard.leads', { period: filter.label.value }), value: format.number(d.totals.newLeads), hint: t('dashboard.kpi.conversion', { rate: format.percent(d.totals.conversionRate) }) },
  ];
});

/** Centers whose activation period ends within 30 days (the owner may want to extend it). */
const ending = computed(() => {
  const today = orgDay(undefined);
  const limit = addDays(today, 30);
  return (data.value?.rows ?? []).filter((row) => row.activeUntil && row.activeUntil.slice(0, 10) >= today && row.activeUntil.slice(0, 10) <= limit);
});
const rows = computed<ComparisonRow[]>(
  () =>
    data.value?.rows.map((row) => ({
      id: row.id,
      name: row.name,
      to: { name: 'owner-center', params: { id: row.id } },
      badge: row.availability === 'ACTIVE' ? undefined : { kind: 'availability' as const, value: row.availability },
      metrics: row.metrics,
    })) ?? [],
);
</script>

<template>
  <PageHeader :title="$t('dashboard.greeting', { name: auth.profile?.name?.split(' ')[0] ?? '' })" :description="$t('owner.dashboard.subtitle')">
    <template #actions>
      <AppButton :icon="Plus" @click="$router.push({ name: 'owner-center-new' })">{{ $t('owner.centers.new') }}</AppButton>
    </template>
  </PageHeader>
  <PeriodBar :filter="filter" :label="$t('owner.dashboard.title')" />

  <QueryState :loading="analytics.isPending.value" :error="analytics.error.value" loading-variant="cards" @retry="analytics.refetch()">
    <div v-if="data" class="flex flex-col gap-6" :class="analytics.isFetching.value && 'opacity-80 transition-opacity'">
      <ul class="grid grid-cols-2 gap-3 lg:grid-cols-4" :aria-label="$t('owner.dashboard.title')">
        <li v-for="kpi in kpis" :key="kpi.key" class="flex">
          <KpiTile :icon="kpi.icon" :label="kpi.label" :value="kpi.value" :hint="kpi.hint" :to="kpi.to" :tone="kpi.tone" />
        </li>
      </ul>

      <AppAlert v-if="data.currencies.length > 1" tone="info">{{ $t('owner.dashboard.mixedCurrencies', { list: data.currencies.join(', ') }) }}</AppAlert>

      <SectionCard v-if="ending.length" :title="$t('owner.dashboard.ending')">
        <ul class="divide-y divide-border">
          <li v-for="row in ending" :key="row.id">
            <RouterLink :to="{ name: 'owner-center', params: { id: row.id } }" class="focus-ring flex min-h-12 items-center gap-3 rounded-lg py-2 hover:text-primary-text">
              <CalendarClock class="size-4 text-warning" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ row.name }}</span>
              <span class="text-sm text-fg-muted">{{ $t('owner.dashboard.endsOn', { date: format.day(row.activeUntil!) }) }}</span>
              <StatusBadge kind="availability" :value="row.availability" />
            </RouterLink>
          </li>
        </ul>
      </SectionCard>

      <section :aria-label="$t('owner.dashboard.centersTitle', { period: filter.label.value })">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold tracking-wide text-fg-muted uppercase">{{ $t('owner.dashboard.centersTitle', { period: filter.label.value }) }}</h2>
          <RouterLink to="/owner/analytics" class="focus-ring rounded text-sm font-medium text-primary-text">{{ $t('owner.nav.analytics') }}</RouterLink>
        </div>
        <EmptyState v-if="!rows.length" :icon="Building2" :title="$t('owner.dashboard.emptyTitle')" :text="$t('owner.dashboard.emptyText')">
          <AppButton :icon="Plus" @click="$router.push({ name: 'owner-center-new' })">{{ $t('owner.centers.new') }}</AppButton>
        </EmptyState>
        <MetricsComparison v-else :rows="rows" :caption="$t('owner.analytics.center')" :currency="currency" columns-id="owner-dashboard" />
      </section>
    </div>
  </QueryState>
</template>

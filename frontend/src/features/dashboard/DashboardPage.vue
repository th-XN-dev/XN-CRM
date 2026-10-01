<script setup lang="ts">
import {
  AlarmClock,
  CalendarCheck,
  CheckCircle2,
  CheckSquare,
  CircleAlert,
  GraduationCap,
  HandCoins,
  House,
  Magnet,
  UserX,
  UsersRound,
  Wallet,
} from 'lucide-vue-next';
import { computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import { P } from '@/app/config/permissions';
import FilterDate from '@/components/data/FilterDate.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppTabs from '@/components/ui/AppTabs.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useCenterAnalytics } from '@/features/analytics/api';
import MetricsComparison, { type ComparisonRow } from '@/features/analytics/components/MetricsComparison.vue';
import { addDays, orgDay } from '@/lib/dates';
import { useListState } from '@/services/query/useListState';
import { useAuthStore } from '@/stores/auth.store';
import { useSessionStore } from '@/stores/session.store';
import { type DashboardFilter, type DashboardPeriod, useDashboardOverview, useRevenueTrend } from './api';
import DashboardFact from './DashboardFact.vue';
import DashboardSection from './DashboardSection.vue';
import RevenueChart from './RevenueChart.vue';

/**
 * Read top to bottom by importance:
 * 1. Critical — what is wrong right now (only non-zero items, each a link to fix it).
 * 2. Important — four numbers for the period.
 * 3. Secondary — the trend and one block per area.
 */
const { t } = useI18n();
const { can } = usePermission();
const auth = useAuthStore();
const session = useSessionStore();
const format = useFormatters();
const branches = useBranchOptions();
const list = useListState({ period: 'month', from: '', to: '', branchId: '' });
const filter = computed<DashboardFilter>(() => ({
  period: list.state.period as DashboardPeriod,
  from: list.state.from || undefined,
  to: list.state.to || undefined,
  branchId: list.state.branchId || undefined,
}));
const overview = useDashboardOverview(filter);
const revenue = useRevenueTrend(filter, () => can(P.FINANCE_REPORT_READ));
const d = computed(() => overview.data.value);

// Director tier: the center's sub-centers (or branches) side by side, when looking at all branches.
const compare = useCenterAnalytics(
  () => ({ period: filter.value.period, from: filter.value.from, to: filter.value.to }),
  () => can(P.ANALYTICS_CENTER_READ) && !session.apiBranchId && !filter.value.branchId && session.branches.length > 1,
);
const comparisonRows = computed<ComparisonRow[]>(() => {
  const data = compare.data.value;
  if (!data) return [];
  const bySub = data.subCenters.filter((s) => s.branchCount > 0);
  return bySub.length > 1
    ? bySub.map((s) => ({ id: s.id ?? 'direct', name: s.name ?? t('management.center.direct'), hint: t('management.center.branchCount', { count: s.branchCount }, s.branchCount), metrics: s.metrics }))
    : data.branches.map((b) => ({ id: b.id, name: b.name, hint: b.code, metrics: b.metrics }));
});

const periods = computed(() =>
  (['today', 'week', 'month', 'year', 'custom'] as const).map((key) => ({ key, label: t(`dashboard.period.${key}`) })),
);
const periodModel = computed({
  get: () => list.state.period,
  set: (value: string) => {
    const today = orgDay(session.organization?.timezone);
    // Custom starts as "the last 30 days" so the screen is never empty.
    list.set(value === 'custom' ? { period: value, from: list.state.from || addDays(today, -29), to: list.state.to || today } : { period: value, from: '', to: '' });
  },
});
const periodLabel = computed(() =>
  list.state.period === 'custom' && list.state.from && list.state.to
    ? `${format.dayShort(list.state.from)} — ${format.dayShort(list.state.to)}`
    : t(`dashboard.period.${list.state.period}`).toLowerCase(),
);

interface Attention {
  key: string;
  icon: Component;
  text: string;
  to: RouteLocationRaw;
  tone: 'danger' | 'warning';
}
/** Critical: only what needs someone today. */
const attention = computed<Attention[]>(() => {
  const data = d.value;
  if (!data) return [];
  const items: Attention[] = [];
  if (data.finance && Number(data.finance.overdueDebt) > 0) {
    items.push({
      key: 'debt',
      icon: Wallet,
      tone: 'danger',
      text: t('dashboard.attention.overdueDebt', { amount: format.money(data.finance.overdueDebt), count: data.finance.overdueInvoices }),
      to: { name: 'finance-debtors', query: { kind: 'overdue' } },
    });
  }
  const tasks = data.tasks ?? data.myTasks;
  if (tasks && tasks.overdue > 0) {
    items.push({ key: 'tasks', icon: CheckSquare, tone: 'danger', text: t('dashboard.attention.overdueTasks', { count: tasks.overdue }, tasks.overdue), to: { name: 'tasks', query: { view: 'overdue' } } });
  }
  if (data.leads && data.leads.followUpsDue > 0) {
    items.push({ key: 'calls', icon: AlarmClock, tone: 'warning', text: t('dashboard.attention.calls', { count: data.leads.followUpsDue }, data.leads.followUpsDue), to: { name: 'leads', query: { followUp: 'today' } } });
  }
  if (data.attendance && data.attendance.today.absent > 0) {
    items.push({ key: 'absent', icon: UserX, tone: 'warning', text: t('dashboard.attention.absent', { count: data.attendance.today.absent }, data.attendance.today.absent), to: { name: 'attendance' } });
  }
  if (data.myTasks && data.myTasks.dueToday > 0) {
    items.push({ key: 'due', icon: CalendarCheck, tone: 'warning', text: t('dashboard.attention.dueToday', { count: data.myTasks.dueToday }, data.myTasks.dueToday), to: { name: 'tasks' } });
  }
  return items;
});

/** Important: the four numbers a CEO reads first. */
const kpis = computed(() => {
  const data = d.value;
  if (!data) return [];
  return [
    data.finance && { key: 'revenue', icon: HandCoins, label: t('dashboard.kpi.revenue'), value: format.money(data.finance.revenue), hint: t('dashboard.kpi.today', { amount: format.money(data.finance.todayPayments) }), to: '/finance' },
    data.students && { key: 'students', icon: GraduationCap, label: t('dashboard.kpi.students'), value: format.number(data.students.active), hint: t('dashboard.kpi.newStudents', { count: data.students.newStudents }), to: '/students' },
    data.attendance && { key: 'attendance', icon: CalendarCheck, label: t('dashboard.kpi.attendance'), value: format.percent(data.attendance.attendanceRate), hint: data.attendance.today.totalMarks ? t('dashboard.kpi.todayRate', { rate: format.percent(data.attendance.today.attendanceRate) }) : t('dashboard.today.noMarks'), to: '/attendance' },
    data.leads && { key: 'leads', icon: Magnet, label: t('dashboard.kpi.leads'), value: format.number(data.leads.newLeads), hint: t('dashboard.kpi.conversion', { rate: format.percent(data.leads.conversionRate) }), to: '/leads' },
  ].filter((kpi): kpi is NonNullable<typeof kpi> => !!kpi);
});
const hasSections = computed(() => !!d.value && [d.value.students, d.value.groups, d.value.finance, d.value.leads, d.value.tasks, d.value.families, d.value.myTasks].some(Boolean));
const tones = { danger: 'border-danger/30 bg-danger-soft text-danger', warning: 'border-warning/40 bg-warning-soft text-fg' } as const;
</script>

<template>
  <PageHeader :title="$t('dashboard.greeting', { name: auth.profile?.name?.split(' ')[0] ?? '' })" :description="$t('dashboard.subtitle')">
    <template #actions>
      <AppTabs v-model="periodModel" :tabs="periods" :label="$t('dashboard.title')" />
    </template>
  </PageHeader>

  <div v-if="list.state.period === 'custom' || branches.showFilter.value" class="-mt-2 mb-5 flex flex-wrap items-end gap-3 [&>*]:w-44">
    <template v-if="list.state.period === 'custom'">
      <FilterDate :model-value="list.state.from" :label="$t('common.from')" :max="list.state.to || undefined" @update:model-value="list.set({ from: $event })" />
      <FilterDate :model-value="list.state.to" :label="$t('common.to')" :min="list.state.from || undefined" @update:model-value="list.set({ to: $event })" />
    </template>
    <FilterSelect
      v-if="branches.showFilter.value"
      :model-value="list.state.branchId"
      :label="$t('common.branch')"
      :options="branches.options.value"
      :all-label="$t('onboarding.allBranches')"
      @update:model-value="list.set({ branchId: $event })"
    />
  </div>

  <QueryState
    :loading="overview.isPending.value"
    :error="overview.error.value"
    :empty="!!d && kpis.length === 0 && attention.length === 0 && !hasSections"
    loading-variant="cards"
    :empty-text="$t('dashboard.empty')"
    @retry="overview.refetch()"
  >
    <div v-if="d" class="flex flex-col gap-6" :class="overview.isFetching.value && 'opacity-80 transition-opacity'">
      <!-- 1. Critical -->
      <section :aria-label="$t('dashboard.attention.title')">
        <h2 class="mb-3 text-sm font-semibold tracking-wide text-fg-muted uppercase">{{ $t('dashboard.attention.title') }}</h2>
        <ul v-if="attention.length" class="grid gap-2 sm:grid-cols-2">
          <li v-for="item in attention" :key="item.key">
            <RouterLink :to="item.to" class="focus-ring flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-[filter] hover:brightness-95 dark:hover:brightness-125" :class="tones[item.tone]">
              <component :is="item.icon" class="size-5 shrink-0" aria-hidden="true" />
              <span class="min-w-0 flex-1">{{ item.text }}</span>
              <CircleAlert v-if="item.tone === 'danger'" class="size-4 shrink-0" aria-hidden="true" />
            </RouterLink>
          </li>
        </ul>
        <p v-else class="flex items-center gap-2 rounded-2xl border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-fg">
          <CheckCircle2 class="size-5 text-success" aria-hidden="true" />{{ $t('dashboard.attention.allClear') }}
        </p>
      </section>

      <!-- 2. Important -->
      <ul v-if="kpis.length" class="grid grid-cols-2 gap-3 lg:grid-cols-4" :aria-label="$t('dashboard.kpi.title', { period: periodLabel })">
        <li v-for="kpi in kpis" :key="kpi.key" class="flex">
          <RouterLink :to="kpi.to" class="focus-ring flex w-full flex-col gap-1 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary">
            <span class="flex items-center gap-2 text-xs font-medium text-fg-muted"><component :is="kpi.icon" class="size-4" aria-hidden="true" />{{ kpi.label }}</span>
            <span class="text-2xl font-semibold tracking-tight text-fg tabular-nums sm:text-3xl">{{ kpi.value }}</span>
            <span class="text-xs text-fg-muted">{{ kpi.hint }}</span>
          </RouterLink>
        </li>
      </ul>

      <!-- 3. Secondary -->
      <SectionCard v-if="revenue.data.value" :title="$t('dashboard.chart.title', { period: periodLabel })">
        <template #actions>
          <span class="text-sm font-semibold text-fg tabular-nums">{{ format.money(revenue.data.value.totalIncome) }}</span>
        </template>
        <p v-if="Number(revenue.data.value.totalIncome) === 0" class="py-6 text-center text-sm text-fg-muted">{{ $t('dashboard.chart.empty') }}</p>
        <RevenueChart v-else :series="revenue.data.value.series" :granularity="revenue.data.value.granularity" :title="$t('dashboard.chart.title', { period: periodLabel })" />
      </SectionCard>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardSection v-if="d.finance" :title="$t('nav.finance')" :icon="Wallet" to="/finance" :headline="format.money(d.finance.outstandingDebt)" :headline-label="$t('dashboard.finance.debt')">
          <DashboardFact :label="$t('dashboard.finance.overdueDebt')" :value="format.money(d.finance.overdueDebt)" :tone="Number(d.finance.overdueDebt) > 0 ? 'danger' : undefined" />
          <DashboardFact :label="$t('dashboard.finance.overdueInvoices')" :value="d.finance.overdueInvoices" :tone="d.finance.overdueInvoices > 0 ? 'danger' : undefined" />
          <DashboardFact :label="$t('dashboard.finance.expenses')" :value="format.money(d.finance.expenses)" />
          <DashboardFact :label="$t('dashboard.today.revenue')" :value="format.money(d.finance.todayPayments)" />
        </DashboardSection>

        <DashboardSection v-if="d.students" :title="$t('nav.students')" :icon="GraduationCap" to="/students" :headline="format.number(d.students.total)" :headline-label="$t('dashboard.students.all')">
          <DashboardFact :label="$t('status.student.ACTIVE')" :value="d.students.active" tone="success" />
          <DashboardFact :label="$t('status.student.FROZEN')" :value="d.students.frozen" />
          <DashboardFact :label="$t('status.student.GRADUATED')" :value="d.students.graduated" />
          <DashboardFact :label="$t('status.student.LEFT')" :value="d.students.left" />
        </DashboardSection>

        <DashboardSection v-if="d.groups" :title="$t('nav.groups')" :icon="UsersRound" to="/groups" :headline="format.number(d.groups.active)" :headline-label="$t('dashboard.groups.active')">
          <DashboardFact :label="$t('dashboard.groups.enrolled')" :value="`${d.groups.enrolled} / ${d.groups.capacity}`" />
          <DashboardFact :label="$t('dashboard.groups.free')" :value="Math.max(d.groups.capacity - d.groups.enrolled, 0)" tone="success" />
          <DashboardFact v-if="d.teachers" :label="$t('dashboard.groups.teachers')" :value="d.teachers.active" />
        </DashboardSection>

        <DashboardSection v-if="d.leads" :title="$t('nav.leads')" :icon="Magnet" to="/leads" :headline="format.number(d.leads.newLeads)" :headline-label="$t('dashboard.leads.new', { period: periodLabel })">
          <DashboardFact :label="$t('dashboard.leads.followUps')" :value="d.leads.followUpsDue" :tone="d.leads.followUpsDue > 0 ? 'warning' : undefined" />
          <DashboardFact :label="$t('dashboard.leads.trials')" :value="d.leads.trialBooked" />
          <DashboardFact :label="$t('dashboard.leads.converted')" :value="d.leads.converted" tone="success" />
          <DashboardFact :label="$t('dashboard.leads.rate')" :value="format.percent(d.leads.conversionRate)" />
        </DashboardSection>

        <DashboardSection
          v-if="d.tasks || d.myTasks"
          :title="d.tasks ? $t('dashboard.tasks.team') : $t('dashboard.tasks.mineTitle')"
          :icon="CheckSquare"
          :to="d.tasks ? '/tasks?view=all' : '/tasks'"
          :headline="format.number((d.tasks ?? d.myTasks)!.open)"
          :headline-label="$t('dashboard.tasks.open')"
        >
          <DashboardFact :label="$t('dashboard.tasks.dueToday')" :value="(d.tasks ?? d.myTasks)!.dueToday" />
          <DashboardFact :label="$t('dashboard.tasks.overdue')" :value="(d.tasks ?? d.myTasks)!.overdue" :tone="(d.tasks ?? d.myTasks)!.overdue > 0 ? 'danger' : undefined" />
          <DashboardFact :label="$t('dashboard.tasks.completed', { period: periodLabel })" :value="(d.tasks ?? d.myTasks)!.completed" tone="success" />
          <DashboardFact v-if="d.tasks && d.myTasks" :label="$t('dashboard.tasks.mine')" :value="d.myTasks.open" />
        </DashboardSection>

        <DashboardSection v-if="d.families" :title="$t('nav.families')" :icon="House" to="/families" :headline="format.number(d.families.active)" :headline-label="$t('dashboard.families.active')">
          <DashboardFact :label="$t('common.total')" :value="d.families.total" />
          <DashboardFact :label="$t('status.active.false')" :value="d.families.total - d.families.active" />
        </DashboardSection>
      </div>

      <section v-if="comparisonRows.length > 1" :aria-label="$t('management.analytics.comparison', { period: periodLabel })">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold tracking-wide text-fg-muted uppercase">{{ $t('management.analytics.comparison', { period: periodLabel }) }}</h2>
          <RouterLink to="/analytics" class="focus-ring rounded text-sm font-medium text-primary-text">{{ $t('management.analytics.open') }}</RouterLink>
        </div>
        <MetricsComparison :rows="comparisonRows" :caption="$t('management.analytics.branch')" columns-id="dashboard-comparison" />
      </section>
    </div>
  </QueryState>
</template>

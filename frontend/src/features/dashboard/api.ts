import { computed, type Ref } from 'vue';
import { api } from '@/services/api/http';
import type { DashboardOverviewDto, RevenueReportDto } from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';

export type DashboardPeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
/** GET /dashboard/overview — a section is null when the member lacks its permission. */
export type DashboardOverview = DashboardOverviewDto;

export interface DashboardFilter {
  period: DashboardPeriod;
  /** YYYY-MM-DD, only with `custom`. */
  from?: string;
  to?: string;
  branchId?: string;
}

function params(filter: DashboardFilter) {
  return filter.period === 'custom'
    ? { from: filter.from, to: filter.to, branchId: filter.branchId }
    : { period: filter.period, branchId: filter.branchId };
}

/** Cached for a minute: switching periods back and forth is instant. */
export function useDashboardOverview(filter: Ref<DashboardFilter>) {
  return useApiQuery({
    key: computed(() => ['dashboard', 'overview', filter.value]),
    fn: () => api.get<DashboardOverview>('/dashboard/overview', { params: params(filter.value) }),
    enabled: () => filter.value.period !== 'custom' || (!!filter.value.from && !!filter.value.to),
    keepPrevious: true,
    staleTime: 60_000,
  });
}

/** Revenue per day/month for the chart (finance.report.read). */
export function useRevenueTrend(filter: Ref<DashboardFilter>, enabled: () => boolean) {
  return useApiQuery({
    key: computed(() => ['dashboard', 'revenue', filter.value]),
    fn: () => api.get<RevenueReportDto>('/reports/finance/revenue', { params: params(filter.value) }),
    enabled: () => enabled() && (filter.value.period !== 'custom' || (!!filter.value.from && !!filter.value.to)),
    keepPrevious: true,
    staleTime: 60_000,
  });
}

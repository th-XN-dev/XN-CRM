import { toValue, type MaybeRefOrGetter } from 'vue';
import { api } from '@/services/api/http';
import type { CenterAnalyticsDto } from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';

export interface CenterAnalyticsParams {
  period?: string;
  from?: string;
  to?: string;
  subCenterId?: string;
  branchId?: string;
}

export const analyticsApi = {
  center: (params: CenterAnalyticsParams) => api.get<CenterAnalyticsDto>('/analytics/center', { params }),
};

/** The director's center by sub-center and branch (aggregated by the API). */
export function useCenterAnalytics(params: MaybeRefOrGetter<CenterAnalyticsParams>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({
    key: () => ['analytics', 'center', toValue(params)],
    fn: () => analyticsApi.center(toValue(params)),
    keepPrevious: true,
    staleTime: 30_000,
    enabled,
  });
}

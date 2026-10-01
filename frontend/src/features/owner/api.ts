import { toValue, type MaybeRefOrGetter } from 'vue';
import { api } from '@/services/api/http';
import type { AuditLogResponseDto, OwnerAnalyticsDto } from '@/services/api/schema.gen';
import { useAccountQuery } from '@/services/query/useAccountQuery';
import type { Paginated } from '@/types/api';

const platform = { skipTenant: true } as const;

export interface PeriodParams {
  period?: string;
  from?: string;
  to?: string;
}

export const ownerApi = {
  analytics: (params: PeriodParams) => api.get<OwnerAnalyticsDto>('/owner/analytics', { ...platform, params }),
  audit: (params: { page?: number; limit?: number; centerId?: string }) =>
    api.get<Paginated<AuditLogResponseDto>>('/owner/audit', { ...platform, params }),
};

/** Platform totals + one row per center (aggregated by the API). */
export function useOwnerAnalytics(params: MaybeRefOrGetter<PeriodParams>) {
  return useAccountQuery({
    key: () => ['owner', 'analytics', toValue(params)],
    fn: () => ownerApi.analytics(toValue(params)),
    keepPrevious: true,
    staleTime: 30_000,
  });
}

export function useManagementAudit(params: MaybeRefOrGetter<{ page?: number; centerId?: string }>) {
  return useAccountQuery({
    key: () => ['owner', 'audit', toValue(params)],
    fn: () => ownerApi.audit({ limit: 20, ...toValue(params) }),
    keepPrevious: true,
  });
}

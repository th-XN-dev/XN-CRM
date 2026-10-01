import { toValue, type MaybeRefOrGetter } from 'vue';
import { api } from '@/services/api/http';
import type {
  ActivateCenterDto,
  BulkCentersDto,
  BulkCentersResultDto,
  CenterAnalyticsDto,
  CenterDto,
  CreateCenterDto,
  CreatedCenterDto,
  PurgeResultDto,
  UpdateCenterDto,
} from '@/services/api/schema.gen';
import { useAccountQuery } from '@/services/query/useAccountQuery';
import type { Paginated } from '@/types/api';

/** Owner area: no center context is sent — the owner addresses centers by id. */
const platform = { skipTenant: true } as const;

export type CenterStatus = CenterDto['status'];

/** Optional profile fields may be sent as `null` to clear them (the API's optional fields accept null). */
export type UpdateCenterInput = { [K in keyof UpdateCenterDto]?: UpdateCenterDto[K] | null };
export const CENTER_STATUSES: readonly CenterStatus[] = ['ACTIVE', 'FROZEN', 'ARCHIVED'];

export interface CenterListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: CenterStatus;
  sortBy?: 'name' | 'createdAt' | 'activeUntil';
  sortOrder?: 'asc' | 'desc';
}

export interface AnalyticsPeriodParams {
  period?: string;
  from?: string;
  to?: string;
  subCenterId?: string;
  branchId?: string;
}

export const centersApi = {
  list: (params: CenterListParams) => api.get<Paginated<CenterDto>>('/owner/centers', { ...platform, params }),
  get: (id: string) => api.get<CenterDto>(`/owner/centers/${id}`, platform),
  create: (body: CreateCenterDto) => api.post<CreatedCenterDto>('/owner/centers', body, platform),
  update: (id: string, body: UpdateCenterInput) => api.patch<CenterDto>(`/owner/centers/${id}`, body, platform),
  freeze: (id: string, reason?: string) => api.post<CenterDto>(`/owner/centers/${id}/freeze`, { reason }, platform),
  activate: (id: string, body: ActivateCenterDto = {}) => api.post<CenterDto>(`/owner/centers/${id}/activate`, body, platform),
  archive: (id: string) => api.post<CenterDto>(`/owner/centers/${id}/archive`, undefined, platform),
  /** Permanent: archived centers only; `confirm` = the center's slug. */
  remove: (id: string, confirm: string) => api.delete<PurgeResultDto>(`/owner/centers/${id}`, { ...platform, data: { confirm } }),
  /** Archive or delete many; for `delete`, `confirm` = the number of ids. */
  bulk: (body: BulkCentersDto) => api.post<BulkCentersResultDto>('/owner/centers/bulk', body, platform),
  analytics: (id: string, params: AnalyticsPeriodParams) =>
    api.get<CenterAnalyticsDto>(`/owner/centers/${id}/analytics`, { ...platform, params }),
};

export function useCenters(params: MaybeRefOrGetter<CenterListParams>) {
  return useAccountQuery({ key: () => ['owner', 'centers', 'list', toValue(params)], fn: () => centersApi.list(toValue(params)), keepPrevious: true });
}

export function useCenter(id: MaybeRefOrGetter<string>) {
  return useAccountQuery({ key: () => ['owner', 'centers', 'detail', toValue(id)], fn: () => centersApi.get(toValue(id)) });
}

export function useCenterDeepAnalytics(id: MaybeRefOrGetter<string>, params: MaybeRefOrGetter<AnalyticsPeriodParams>) {
  return useAccountQuery({
    key: () => ['owner', 'centers', 'analytics', toValue(id), toValue(params)],
    fn: () => centersApi.analytics(toValue(id), toValue(params)),
    keepPrevious: true,
  });
}

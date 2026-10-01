import { toValue, type MaybeRefOrGetter } from 'vue';
import { api } from '@/services/api/http';
import type { CreateBranchDto, UpdateBranchDto } from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';

/** A branch as the management screens see it (GET /organizations/:id/branches). */
export interface BranchDto {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  subCenterId: string | null;
  subCenter: { id: string; name: string; code: string; status: 'ACTIVE' | 'FROZEN' | 'ARCHIVED' } | null;
  createdAt: string;
  updatedAt: string;
}

// The center comes from the path; branch-scoped headers would only narrow the list.
const urlScoped = { skipTenant: true } as const;

export const branchesApi = {
  list: (organizationId: string, params: { isActive?: boolean; subCenterId?: string }) =>
    api.get<BranchDto[]>(`/organizations/${organizationId}/branches`, { ...urlScoped, params }),
  create: (organizationId: string, body: CreateBranchDto) =>
    api.post<BranchDto>(`/organizations/${organizationId}/branches`, body, urlScoped),
  update: (id: string, body: UpdateBranchDto) => api.patch<BranchDto>(`/branches/${id}`, body),
};

/** Every branch the member may manage, active or not. */
export function useManagedBranches(params: MaybeRefOrGetter<{ isActive?: boolean; subCenterId?: string }> = {}) {
  const session = useSessionStore();
  return useApiQuery({
    key: () => ['branches', 'manage', toValue(params)],
    fn: () => branchesApi.list(session.organizationId ?? '', toValue(params)),
    keepPrevious: true,
  });
}

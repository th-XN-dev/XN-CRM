import { toValue, type MaybeRefOrGetter } from 'vue';
import { api } from '@/services/api/http';
import type {
  AssignableRoleDto,
  CreateStaffDto,
  StaffCredentialsDto,
  StaffMemberDto,
  UpdateStaffDto,
} from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import type { Paginated } from '@/types/api';

const urlScoped = { skipTenant: true } as const;

export interface StaffListParams {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
}

export const staffApi = {
  roles: (organizationId: string) => api.get<AssignableRoleDto[]>(`/organizations/${organizationId}/roles`, urlScoped),
  list: (organizationId: string, params: StaffListParams) =>
    api.get<Paginated<StaffMemberDto>>(`/organizations/${organizationId}/staff`, { ...urlScoped, params }),
  create: (organizationId: string, body: CreateStaffDto) =>
    api.post<StaffCredentialsDto>(`/organizations/${organizationId}/staff`, body, urlScoped),
  update: (organizationId: string, id: string, body: UpdateStaffDto) =>
    api.patch<StaffMemberDto>(`/organizations/${organizationId}/staff/${id}`, body, urlScoped),
  resetPassword: (organizationId: string, id: string) =>
    api.post<StaffCredentialsDto>(`/organizations/${organizationId}/staff/${id}/reset-password`, undefined, urlScoped),
};

export function useStaff(params: MaybeRefOrGetter<StaffListParams>) {
  const session = useSessionStore();
  return useApiQuery({
    key: () => ['staff', toValue(params)],
    fn: () => staffApi.list(session.organizationId ?? '', toValue(params)),
    keepPrevious: true,
  });
}

export function useStaffRoles() {
  const session = useSessionStore();
  return useApiQuery({ key: ['staff', 'roles'], fn: () => staffApi.roles(session.organizationId ?? ''), staleTime: 5 * 60_000 });
}

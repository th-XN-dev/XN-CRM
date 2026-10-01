import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import type { SelectOption } from '@/components/ui/AppSelect.vue';
import { api } from '@/services/api/http';
import type {
  CreateDirectoryItemDto,
  CreateEmployeeDto,
  DirectoryItemResponseDto,
  EmployeeBranchResponseDto,
  EmployeeResponseDto,
  EmployeeTaskStatisticsDto,
  UpdateDirectoryItemDto,
  UpdateEmployeeDto,
} from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';
import type { Paginated } from '@/types/api';

export type EmployeeStatus = EmployeeResponseDto['status'];
export const EMPLOYEE_STATUSES: readonly EmployeeStatus[] = ['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED'];
/** Positions and departments share one shape and one screen. */
export type DirectoryKind = 'positions' | 'departments';

export interface EmployeeListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: EmployeeStatus | '';
  positionId?: string;
  departmentId?: string;
  branchId?: string;
  sortBy?: 'lastName' | 'firstName' | 'hireDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}
export interface DirectoryListParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean | string;
}

export const hrApi = {
  employees: (params: EmployeeListParams) => api.get<Paginated<EmployeeResponseDto>>('/employees', { params }),
  employee: (id: string) => api.get<EmployeeResponseDto>(`/employees/${id}`),
  createEmployee: (body: CreateEmployeeDto) => api.post<EmployeeResponseDto>('/employees', body),
  updateEmployee: (id: string, body: UpdateEmployeeDto) => api.patch<EmployeeResponseDto>(`/employees/${id}`, body),
  terminate: (id: string) => api.delete<EmployeeResponseDto>(`/employees/${id}`),
  addBranch: (id: string, branchId: string, isPrimary = false) =>
    api.post<EmployeeBranchResponseDto[]>(`/employees/${id}/branches`, { branchId, isPrimary }),
  setPrimaryBranch: (id: string, branchId: string) =>
    api.patch<EmployeeBranchResponseDto[]>(`/employees/${id}/branches/${branchId}/primary`),
  removeBranch: (id: string, branchId: string) => api.delete<EmployeeBranchResponseDto[]>(`/employees/${id}/branches/${branchId}`),
  taskStats: (id: string) => api.get<EmployeeTaskStatisticsDto>(`/tasks/statistics/employees/${id}`),
  directory: (kind: DirectoryKind, params: DirectoryListParams) =>
    api.get<Paginated<DirectoryItemResponseDto>>(`/${kind}`, { params }),
  createItem: (kind: DirectoryKind, body: CreateDirectoryItemDto) => api.post<DirectoryItemResponseDto>(`/${kind}`, body),
  updateItem: (kind: DirectoryKind, id: string, body: UpdateDirectoryItemDto) =>
    api.patch<DirectoryItemResponseDto>(`/${kind}/${id}`, body),
  deactivateItem: (kind: DirectoryKind, id: string) => api.delete<DirectoryItemResponseDto>(`/${kind}/${id}`),
};

export const HR_KEYS = [['employees'], ['hr'], ['tasks']] as const;

export function useEmployees(params: MaybeRefOrGetter<EmployeeListParams>) {
  return useApiQuery({ key: () => ['employees', 'list', toValue(params)], fn: () => hrApi.employees(toValue(params)), keepPrevious: true });
}

export function useEmployee(id: MaybeRefOrGetter<string>) {
  return useApiQuery({ key: () => ['employees', 'detail', toValue(id)], fn: () => hrApi.employee(toValue(id)) });
}

export function useDirectory(kind: MaybeRefOrGetter<DirectoryKind>, params: MaybeRefOrGetter<DirectoryListParams>) {
  return useApiQuery({
    key: () => ['hr', toValue(kind), toValue(params)],
    fn: () => hrApi.directory(toValue(kind), toValue(params)),
    keepPrevious: true,
  });
}

/** Active positions or departments for selects. */
export function useDirectoryOptions(kind: DirectoryKind, enabled?: MaybeRefOrGetter<boolean>) {
  const query = useApiQuery({
    key: ['hr', kind, 'options'],
    fn: () => hrApi.directory(kind, { isActive: true, limit: 100 }),
    staleTime: 5 * 60_000,
    enabled,
  });
  const options = computed<SelectOption[]>(() => query.data.value?.items.map((item) => ({ value: item.id, label: item.name })) ?? []);
  return { ...query, options };
}

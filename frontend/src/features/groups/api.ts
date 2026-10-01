import { api } from '@/services/api/http';
import type {
  CreateGroupDto,
  CreateScheduleDto,
  GroupResponseDto,
  ScheduleResponseDto,
  TimetableSlotDto,
  UpdateGroupDto,
  UpdateScheduleDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';

export type GroupStatus = GroupResponseDto['status'];
export const GROUP_STATUSES: readonly GroupStatus[] = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

export interface GroupListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: GroupStatus | '';
  branchId?: string;
  courseId?: string;
  levelId?: string;
  sortBy?: 'name' | 'startDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface TimetableParams {
  branchId?: string;
  groupId?: string;
  teacherId?: string;
  roomId?: string;
}

export const groupsApi = {
  list: (params: GroupListParams) => api.get<Paginated<GroupResponseDto>>('/groups', { params }),
  get: (id: string) => api.get<GroupResponseDto>(`/groups/${id}`),
  create: (body: CreateGroupDto) => api.post<GroupResponseDto>('/groups', body),
  update: (id: string, body: UpdateGroupDto) => api.patch<GroupResponseDto>(`/groups/${id}`, body),
  /** Soft delete = CANCELLED. */
  cancel: (id: string) => api.delete<GroupResponseDto>(`/groups/${id}`),
  schedules: (groupId: string) =>
    api.get<Paginated<ScheduleResponseDto>>(`/groups/${groupId}/schedules`, { params: { isActive: true, limit: 50 } }),
  addSchedule: (groupId: string, body: CreateScheduleDto) =>
    api.post<ScheduleResponseDto>(`/groups/${groupId}/schedules`, body),
  updateSchedule: (id: string, body: UpdateScheduleDto) => api.patch<ScheduleResponseDto>(`/schedules/${id}`, body),
  removeSchedule: (id: string) => api.delete<ScheduleResponseDto>(`/schedules/${id}`),
  timetable: (params: TimetableParams) => api.get<TimetableSlotDto[]>('/schedules', { params }),
};

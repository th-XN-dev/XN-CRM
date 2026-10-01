import { toValue, type MaybeRefOrGetter } from 'vue';
import { api } from '@/services/api/http';
import type {
  CreateTaskDto,
  TaskActivityResponseDto,
  TaskCommentResponseDto,
  TaskResponseDto,
  UpdateTaskDto,
} from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';
import type { Paginated } from '@/types/api';

export type TaskStatus = TaskResponseDto['status'];
export type TaskPriority = TaskResponseDto['priority'];
export type RelatedType = NonNullable<TaskResponseDto['relatedType']>;
export const TASK_STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

/** Where a task's "related to" link goes. */
export const RELATED_ROUTES: Record<RelatedType, string> = {
  LEAD: 'lead',
  STUDENT: 'student',
  FAMILY: 'family',
  GROUP: 'group',
  EMPLOYEE: 'employee',
};

export interface TaskListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskStatus | '';
  priority?: TaskPriority | '';
  assignedToId?: string;
  mine?: boolean;
  overdue?: boolean;
  relatedType?: RelatedType;
  relatedId?: string;
  branchId?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'status' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export const tasksApi = {
  list: (params: TaskListParams) => api.get<Paginated<TaskResponseDto>>('/tasks', { params }),
  get: (id: string) => api.get<TaskResponseDto>(`/tasks/${id}`),
  create: (body: CreateTaskDto) => api.post<TaskResponseDto>('/tasks', body),
  update: (id: string, body: UpdateTaskDto) => api.patch<TaskResponseDto>(`/tasks/${id}`, body),
  remove: (id: string) => api.delete<TaskResponseDto>(`/tasks/${id}`),
  changeStatus: (id: string, status: TaskStatus, note?: string) => api.patch<TaskResponseDto>(`/tasks/${id}/status`, { status, note }),
  assign: (id: string, assignedToId: string | null) => api.patch<TaskResponseDto>(`/tasks/${id}/assign`, { assignedToId }),
  comments: (id: string) => api.get<Paginated<TaskCommentResponseDto>>(`/tasks/${id}/comments`, { params: { limit: 100 } }),
  addComment: (id: string, content: string) => api.post<TaskCommentResponseDto>(`/tasks/${id}/comments`, { content }),
  history: (id: string) => api.get<Paginated<TaskActivityResponseDto>>(`/tasks/${id}/history`, { params: { limit: 100 } }),
};

export const TASK_KEYS = [['tasks'], ['dashboard'], ['notifications']] as const;

export function useTasks(params: MaybeRefOrGetter<TaskListParams>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({ key: () => ['tasks', 'list', toValue(params)], fn: () => tasksApi.list(toValue(params)), keepPrevious: true, enabled });
}

export function useTask(id: MaybeRefOrGetter<string>) {
  return useApiQuery({ key: () => ['tasks', 'detail', toValue(id)], fn: () => tasksApi.get(toValue(id)) });
}

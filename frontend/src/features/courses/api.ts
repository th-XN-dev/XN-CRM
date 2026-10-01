import { api } from '@/services/api/http';
import type {
  CourseDetailDto,
  CourseListItemDto,
  CourseResponseDto,
  CreateCourseDto,
  CreateLevelDto,
  LevelResponseDto,
  UpdateCourseDto,
  UpdateLevelDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';

export interface CourseListParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean | string;
  sortBy?: 'name' | 'code' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export const coursesApi = {
  list: (params: CourseListParams) => api.get<Paginated<CourseListItemDto>>('/courses', { params }),
  get: (id: string) => api.get<CourseDetailDto>(`/courses/${id}`),
  create: (body: CreateCourseDto) => api.post<CourseResponseDto>('/courses', body),
  update: (id: string, body: UpdateCourseDto) => api.patch<CourseResponseDto>(`/courses/${id}`, body),
  deactivate: (id: string) => api.delete<CourseResponseDto>(`/courses/${id}`),
  createLevel: (courseId: string, body: CreateLevelDto) =>
    api.post<LevelResponseDto>(`/courses/${courseId}/levels`, body),
  updateLevel: (id: string, body: UpdateLevelDto) => api.patch<LevelResponseDto>(`/levels/${id}`, body),
  deactivateLevel: (id: string) => api.delete<LevelResponseDto>(`/levels/${id}`),
};

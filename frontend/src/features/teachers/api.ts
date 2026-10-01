import { api } from '@/services/api/http';
import type {
  AttendanceSummaryReportDto,
  CreateTeacherDto,
  TeacherDetailDto,
  TeacherResponseDto,
  UpdateTeacherDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';

export interface TeacherListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | '';
  branchId?: string;
  sortBy?: 'lastName' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export const teachersApi = {
  list: (params: TeacherListParams) => api.get<Paginated<TeacherResponseDto>>('/teachers', { params }),
  get: (id: string) => api.get<TeacherDetailDto>(`/teachers/${id}`),
  create: (body: CreateTeacherDto) => api.post<TeacherResponseDto>('/teachers', body),
  update: (id: string, body: UpdateTeacherDto) => api.patch<TeacherResponseDto>(`/teachers/${id}`, body),
  deactivate: (id: string) => api.delete<TeacherResponseDto>(`/teachers/${id}`),
  /** This month's attendance in the teacher's groups (reports.academic.read). */
  attendance: (teacherId: string) =>
    api.get<AttendanceSummaryReportDto>('/reports/attendance/summary', { params: { teacherId, period: 'month' } }),
};

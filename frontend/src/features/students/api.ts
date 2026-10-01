import { api } from '@/services/api/http';
import type {
  CreateStudentDto,
  EnrollmentResponseDto,
  StudentDetailDto,
  StudentListItemDto,
  StudentResponseDto,
  UpdateStudentDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';

export type StudentStatus = StudentResponseDto['status'];
export const STUDENT_STATUSES: readonly StudentStatus[] = ['ACTIVE', 'FROZEN', 'GRADUATED', 'LEFT'];

export interface StudentListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: StudentStatus | '';
  branchId?: string;
  familyId?: string;
  groupId?: string;
  courseId?: string;
  sortBy?: 'lastName' | 'firstName' | 'joinedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export const studentsApi = {
  list: (params: StudentListParams) => api.get<Paginated<StudentListItemDto>>('/students', { params }),
  get: (id: string) => api.get<StudentDetailDto>(`/students/${id}`),
  create: (body: CreateStudentDto) => api.post<StudentResponseDto>('/students', body),
  update: (id: string, body: UpdateStudentDto) => api.patch<StudentResponseDto>(`/students/${id}`, body),
  /** "Delete" never removes a student: it marks them LEFT (history and payments stay). */
  markLeft: (id: string) => api.delete<StudentResponseDto>(`/students/${id}`),
  enrollments: (id: string, params: { page?: number; limit?: number }) =>
    api.get<Paginated<EnrollmentResponseDto>>(`/students/${id}/enrollments`, { params }),
};

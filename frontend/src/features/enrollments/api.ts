import { api } from '@/services/api/http';
import type {
  CancelEnrollmentDto,
  CreateEnrollmentDto,
  EnrollmentResponseDto,
  TransferEnrollmentDto,
  TransferResultDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';

export interface EnrollmentListParams {
  page?: number;
  limit?: number;
  groupId?: string;
  studentId?: string;
  status?: EnrollmentResponseDto['status'] | '';
  sortBy?: 'startedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export const enrollmentsApi = {
  list: (params: EnrollmentListParams) =>
    api.get<Paginated<EnrollmentResponseDto>>('/enrollments', { params }),
  create: (body: CreateEnrollmentDto) => api.post<EnrollmentResponseDto>('/enrollments', body),
  transfer: (id: string, body: TransferEnrollmentDto) =>
    api.post<TransferResultDto>(`/enrollments/${id}/transfer`, body),
  cancel: (id: string, body: CancelEnrollmentDto) =>
    api.post<EnrollmentResponseDto>(`/enrollments/${id}/cancel`, body),
};

/** Every list that shows who studies where. */
export const ENROLLMENT_KEYS = [['enrollments'], ['students'], ['groups'], ['attendance'], ['dashboard']] as const;

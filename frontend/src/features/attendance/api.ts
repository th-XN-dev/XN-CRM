import { api } from '@/services/api/http';
import type {
  GroupAttendanceDto,
  GroupAttendanceStatsDto,
  MarkAttendanceResultDto,
  MarkGroupAttendanceDto,
  StudentAttendanceItemDto,
  StudentAttendanceStatsDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';

export type AttendanceStatus = StudentAttendanceItemDto['status'];
export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

export const attendanceApi = {
  roster: (groupId: string, date: string) =>
    api.get<GroupAttendanceDto>(`/groups/${groupId}/attendance`, { params: { date } }),
  mark: (groupId: string, body: MarkGroupAttendanceDto) =>
    api.post<MarkAttendanceResultDto>(`/attendance/group/${groupId}`, body),
  groupStats: (groupId: string, params: { from?: string; to?: string }) =>
    api.get<GroupAttendanceStatsDto>(`/groups/${groupId}/attendance/statistics`, { params }),
  studentHistory: (studentId: string, params: { page?: number; limit?: number; from?: string; to?: string }) =>
    api.get<Paginated<StudentAttendanceItemDto>>(`/students/${studentId}/attendance`, { params }),
  studentStats: (studentId: string, params: { from?: string; to?: string }) =>
    api.get<StudentAttendanceStatsDto>(`/students/${studentId}/attendance/statistics`, { params }),
};

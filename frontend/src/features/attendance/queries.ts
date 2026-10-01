import { toValue, type MaybeRefOrGetter } from 'vue';
import { useApiQuery } from '@/services/query/useApiQuery';
import { attendanceApi } from './api';

export function useRoster(groupId: MaybeRefOrGetter<string>, date: MaybeRefOrGetter<string>) {
  return useApiQuery({
    key: () => ['attendance', 'roster', toValue(groupId), toValue(date)],
    fn: () => attendanceApi.roster(toValue(groupId), toValue(date)),
    enabled: () => !!toValue(groupId) && !!toValue(date),
  });
}

export function useGroupAttendanceStats(groupId: MaybeRefOrGetter<string>, range: MaybeRefOrGetter<{ from?: string; to?: string }> = {}) {
  return useApiQuery({
    key: () => ['attendance', 'group-stats', toValue(groupId), toValue(range)],
    fn: () => attendanceApi.groupStats(toValue(groupId), toValue(range)),
  });
}

export function useStudentAttendanceStats(studentId: MaybeRefOrGetter<string>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({
    key: () => ['attendance', 'student-stats', toValue(studentId)],
    fn: () => attendanceApi.studentStats(toValue(studentId), {}),
    enabled,
  });
}

export function useStudentAttendance(studentId: MaybeRefOrGetter<string>, page: MaybeRefOrGetter<number>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({
    key: () => ['attendance', 'student', toValue(studentId), toValue(page)],
    fn: () => attendanceApi.studentHistory(toValue(studentId), { page: toValue(page), limit: 15 }),
    keepPrevious: true,
    enabled,
  });
}

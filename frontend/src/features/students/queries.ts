import { toValue, type MaybeRefOrGetter } from 'vue';
import { useApiQuery } from '@/services/query/useApiQuery';
import { studentsApi, type StudentListParams } from './api';

export function useStudents(params: MaybeRefOrGetter<StudentListParams>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({
    key: () => ['students', 'list', toValue(params)],
    fn: () => studentsApi.list(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

export function useStudent(id: MaybeRefOrGetter<string>) {
  return useApiQuery({
    key: () => ['students', 'detail', toValue(id)],
    fn: () => studentsApi.get(toValue(id)),
  });
}

export function useStudentEnrollments(id: MaybeRefOrGetter<string>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({
    key: () => ['enrollments', 'student', toValue(id)],
    fn: () => studentsApi.enrollments(toValue(id), { limit: 50 }),
    enabled,
  });
}

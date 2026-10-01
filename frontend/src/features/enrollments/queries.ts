import { toValue, type MaybeRefOrGetter } from 'vue';
import { useApiQuery } from '@/services/query/useApiQuery';
import { enrollmentsApi, type EnrollmentListParams } from './api';

export function useEnrollments(params: MaybeRefOrGetter<EnrollmentListParams>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({
    key: () => ['enrollments', 'list', toValue(params)],
    fn: () => enrollmentsApi.list(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

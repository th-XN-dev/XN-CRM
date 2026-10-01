import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import type { SelectOption } from '@/components/ui/AppSelect.vue';
import { fullName } from '@/lib/people';
import { useApiQuery } from '@/services/query/useApiQuery';
import { teachersApi, type TeacherListParams } from './api';

export function useTeachers(params: MaybeRefOrGetter<TeacherListParams>) {
  return useApiQuery({
    key: () => ['teachers', 'list', toValue(params)],
    fn: () => teachersApi.list(toValue(params)),
    keepPrevious: true,
  });
}

export function useTeacher(id: MaybeRefOrGetter<string>) {
  return useApiQuery({ key: () => ['teachers', 'detail', toValue(id)], fn: () => teachersApi.get(toValue(id)) });
}

/** Active teachers for selects (assign to a group, schedule filter). */
export function useTeacherOptions(enabled?: MaybeRefOrGetter<boolean>, branchId?: MaybeRefOrGetter<string | undefined>) {
  const query = useApiQuery({
    key: () => ['teachers', 'options', toValue(branchId) ?? null],
    fn: () =>
      teachersApi.list({ status: 'ACTIVE', branchId: toValue(branchId) || undefined, limit: 100, sortBy: 'lastName', sortOrder: 'asc' }),
    staleTime: 60_000,
    enabled,
  });
  const options = computed<SelectOption[]>(
    () => query.data.value?.items.map((teacher) => ({ value: teacher.id, label: fullName(teacher) })) ?? [],
  );
  return { ...query, options };
}

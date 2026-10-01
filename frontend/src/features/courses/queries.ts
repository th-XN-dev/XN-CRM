import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import type { SelectOption } from '@/components/ui/AppSelect.vue';
import { useApiQuery } from '@/services/query/useApiQuery';
import { coursesApi, type CourseListParams } from './api';

export function useCourses(params: MaybeRefOrGetter<CourseListParams>) {
  return useApiQuery({
    key: () => ['courses', 'list', toValue(params)],
    fn: () => coursesApi.list(toValue(params)),
    keepPrevious: true,
  });
}

export function useCourse(id: MaybeRefOrGetter<string>) {
  return useApiQuery({ key: () => ['courses', 'detail', toValue(id)], fn: () => coursesApi.get(toValue(id)) });
}

/** Active courses for selects and filters (an organization has a handful). */
export function useCourseOptions(enabled?: MaybeRefOrGetter<boolean>) {
  const query = useApiQuery({
    key: ['courses', 'options'],
    fn: () => coursesApi.list({ isActive: true, limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    staleTime: 5 * 60_000,
    enabled,
  });
  const options = computed<SelectOption[]>(
    () => query.data.value?.items.map((course) => ({ value: course.id, label: course.name })) ?? [],
  );
  return { ...query, options };
}

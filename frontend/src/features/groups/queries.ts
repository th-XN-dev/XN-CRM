import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import type { SelectOption } from '@/components/ui/AppSelect.vue';
import { useApiQuery } from '@/services/query/useApiQuery';
import { groupsApi, type GroupListParams, type TimetableParams } from './api';

export function useGroups(params: MaybeRefOrGetter<GroupListParams>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({
    key: () => ['groups', 'list', toValue(params)],
    fn: () => groupsApi.list(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

export function useGroup(id: MaybeRefOrGetter<string>) {
  return useApiQuery({ key: () => ['groups', 'detail', toValue(id)], fn: () => groupsApi.get(toValue(id)) });
}

export function useGroupSchedule(id: MaybeRefOrGetter<string>) {
  return useApiQuery({ key: () => ['schedules', 'group', toValue(id)], fn: () => groupsApi.schedules(toValue(id)) });
}

export function useTimetable(params: MaybeRefOrGetter<TimetableParams>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({
    key: () => ['schedules', 'timetable', toValue(params)],
    fn: () => groupsApi.timetable(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

/** Running groups for selects (attendance, filters). */
export function useGroupOptions(enabled?: MaybeRefOrGetter<boolean>) {
  const query = useApiQuery({
    key: ['groups', 'options'],
    fn: () => groupsApi.list({ status: 'ACTIVE', limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    staleTime: 60_000,
    enabled,
  });
  const options = computed<SelectOption[]>(
    () => query.data.value?.items.map((group) => ({ value: group.id, label: group.name })) ?? [],
  );
  return { ...query, options };
}

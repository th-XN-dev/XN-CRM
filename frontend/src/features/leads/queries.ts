import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { P } from '@/app/config/permissions';
import type { SelectOption } from '@/components/ui/AppSelect.vue';
import { useApiQuery } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { leadsApi, type LeadListParams } from './api';

export function useLeads(params: MaybeRefOrGetter<LeadListParams>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({
    key: () => ['leads', 'list', toValue(params)],
    fn: () => leadsApi.list(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

export function useFollowUps(filter: MaybeRefOrGetter<'today' | 'overdue' | 'upcoming' | undefined>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({
    key: () => ['leads', 'follow-ups', toValue(filter) ?? 'all'],
    fn: () => leadsApi.followUps({ filter: toValue(filter), limit: 50 }),
    enabled,
  });
}

export function useLead(id: MaybeRefOrGetter<string>) {
  return useApiQuery({ key: () => ['leads', 'detail', toValue(id)], fn: () => leadsApi.get(toValue(id)) });
}

export function useLeadActivities(id: MaybeRefOrGetter<string>, enabled?: MaybeRefOrGetter<boolean>) {
  return useApiQuery({ key: () => ['leads', 'activities', toValue(id)], fn: () => leadsApi.activities(toValue(id), 1), enabled });
}

export function useLeadSources() {
  const session = useSessionStore();
  const query = useApiQuery({
    key: ['leads', 'sources'],
    fn: leadsApi.sources,
    staleTime: 5 * 60_000,
    enabled: () => session.can(P.LEAD_SOURCES_READ),
  });
  const options = computed<SelectOption[]>(() => query.data.value?.map((s) => ({ value: s.id, label: s.name })) ?? []);
  return { ...query, options };
}

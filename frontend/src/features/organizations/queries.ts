import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import type { SelectOption } from '@/components/ui/AppSelect.vue';
import { useApiQuery } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { organizationsApi } from './api';

/**
 * Members who can be assigned (optionally only those working in a branch).
 * Needs users.read or leads.assign; otherwise the list is empty and pickers
 * fall back to "assign to me".
 */
export function useMembers(branchId?: MaybeRefOrGetter<string | undefined>) {
  const session = useSessionStore();
  const { t, te } = useI18n();
  const query = useApiQuery({
    key: () => ['members', toValue(branchId) ?? null],
    fn: () => organizationsApi.members(session.organizationId ?? '', toValue(branchId) || undefined),
    enabled: () => session.can([P.USERS_READ, P.LEADS_ASSIGN]),
    staleTime: 5 * 60_000,
  });
  const options = computed<SelectOption[]>(
    () =>
      query.data.value?.map((member) => ({
        value: member.userId,
        label: `${member.name} · ${te(`roles.${member.role}`) ? t(`roles.${member.role}`) : member.role}`,
      })) ?? [],
  );
  return { ...query, options };
}

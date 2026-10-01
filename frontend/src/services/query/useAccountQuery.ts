import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useAuthStore } from '@/stores/auth.store';

interface AccountQueryOptions<T> {
  /** e.g. `['owner', 'centers', params]` or `['account', 'sessions']`. */
  key: MaybeRefOrGetter<readonly unknown[]>;
  fn: () => Promise<T>;
  enabled?: MaybeRefOrGetter<boolean>;
  keepPrevious?: boolean;
  staleTime?: number;
}

/**
 * Server state outside any center: the signed-in account and the platform
 * owner's area. Unlike `useApiQuery` it needs no organization/branch, only a
 * session; the user id is part of the key so accounts never share a cache.
 */
export function useAccountQuery<T>(options: AccountQueryOptions<T>) {
  const auth = useAuthStore();
  return useQuery({
    queryKey: computed(() => [...toValue(options.key), { userId: auth.profile?.id ?? null }]),
    queryFn: options.fn,
    enabled: computed(() => auth.isAuthenticated && (toValue(options.enabled) ?? true)),
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
    staleTime: options.staleTime,
  });
}

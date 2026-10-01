import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { useSessionStore } from '@/stores/session.store';
import { useToastStore } from '@/stores/toast.store';

interface ApiQueryOptions<T> {
  /** Feature-first key, e.g. `['students', 'list', params]`; the tenant is appended. */
  key: MaybeRefOrGetter<readonly unknown[]>;
  fn: () => Promise<T>;
  enabled?: MaybeRefOrGetter<boolean>;
  /** Keep showing the previous page/filter result while the next one loads. */
  keepPrevious?: boolean;
  staleTime?: number;
  refetchInterval?: number;
}

/**
 * Server state for the current organization/branch. The tenant is part of the
 * key, so switching branch never shows another branch's data, and nothing runs
 * before the session is ready.
 */
export function useApiQuery<T>(options: ApiQueryOptions<T>) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed<QueryKey>(() => [
      ...toValue(options.key),
      { organizationId: session.organizationId, branchId: session.apiBranchId },
    ]),
    queryFn: options.fn,
    enabled: computed(() => session.isReady && (toValue(options.enabled) ?? true)),
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
    staleTime: options.staleTime,
    refetchInterval: options.refetchInterval,
  });
}

interface ApiMutationOptions<TVariables, TResult> {
  fn: (variables: TVariables) => Promise<TResult>;
  /** Key prefixes refetched after success, e.g. `[['students'], ['dashboard']]`. */
  invalidates?: readonly (readonly unknown[])[];
  /** Toast after success (string or built from the result). */
  success?: string | ((result: TResult, variables: TVariables) => string);
  /**
   * Toast the error. Off for forms, which map errors onto their fields
   * (see `useFormSubmit`).
   */
  toastError?: boolean;
  onSuccess?: (result: TResult, variables: TVariables) => void | Promise<void>;
}

/**
 * Writes are never optimistic here: money, enrollment and status changes wait
 * for the server, then the affected lists are refetched.
 */
export function useApiMutation<TVariables = void, TResult = unknown>(
  options: ApiMutationOptions<TVariables, TResult>,
) {
  const queryClient = useQueryClient();
  const toast = useToastStore();
  return useMutation({
    mutationFn: options.fn,
    onSuccess: async (result, variables) => {
      await Promise.all(
        (options.invalidates ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      if (options.success) {
        toast.success(
          typeof options.success === 'string' ? options.success : options.success(result, variables),
        );
      }
      await options.onSuccess?.(result, variables);
    },
    onError: (error) => {
      if (options.toastError) toast.error(apiErrorMessage(error));
    },
  });
}

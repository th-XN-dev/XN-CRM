import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/vue-query';
import { computed, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { P } from '@/app/config/permissions';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { api } from '@/services/api/http';
import type {
  NotificationPreferenceItemDto,
  NotificationPreferenceResponseDto,
  NotificationResponseDto,
} from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { useToastStore } from '@/stores/toast.store';
import { createPollingChannel, type NotificationChannel } from './realtime';
import type { Paginated } from '@/types/api';

export type NotificationType = NotificationResponseDto['type'];
type Page = Paginated<NotificationResponseDto>;

export const notificationsApi = {
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  list: (params: { page?: number; limit?: number; isRead?: boolean; type?: NotificationType }) =>
    api.get<Page>('/notifications', { params }),
  markRead: (id: string) => api.patch<NotificationResponseDto>(`/notifications/${id}/read`),
  markAllRead: () => api.patch<{ updated: number }>('/notifications/read-all'),
  preferences: () => api.get<NotificationPreferenceResponseDto[]>('/notification-preferences'),
  updatePreferences: (items: NotificationPreferenceItemDto[]) =>
    api.patch<NotificationPreferenceResponseDto[]>('/notification-preferences', { items }),
};

const unreadKey = (organizationId: string | null) => ['notifications', 'unread-count', organizationId];

/** Badge count — kept fresh by `useNotificationFeed` (no polling of its own). */
export function useUnreadCount() {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => unreadKey(session.organizationId)),
    queryFn: notificationsApi.unreadCount,
    enabled: computed(() => session.isReady && session.can(P.NOTIFICATIONS_READ)),
    select: (data) => data.count,
  });
}

/**
 * Mounted once in the shell: listens to the notification channel; when the
 * unread count grows, the badge and the lists refresh and a short toast
 * names the newest notification.
 */
export function useNotificationFeed(channel: NotificationChannel = createPollingChannel(async () => (await notificationsApi.unreadCount()).count, 60_000)) {
  const session = useSessionStore();
  const queryClient = useQueryClient();
  const toast = useToastStore();
  let previous: number | null = null;
  let unsubscribe: (() => void) | null = null;

  watch(
    () => session.isReady && session.can(P.NOTIFICATIONS_READ) && session.organizationId,
    (active) => {
      unsubscribe?.();
      unsubscribe = null;
      previous = null;
      if (!active) return;
      unsubscribe = channel.subscribe(async (unread) => {
        queryClient.setQueryData(unreadKey(session.organizationId), { count: unread });
        if (previous !== null && unread > previous) {
          await queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
          const newest = await notificationsApi.list({ isRead: false, limit: 1 }).catch(() => null);
          if (newest?.items[0]) toast.info(newest.items[0].title);
        }
        previous = unread;
      });
    },
    { immediate: true },
  );
  onScopeDispose(() => unsubscribe?.());
}

export function useNotifications(
  params: MaybeRefOrGetter<{ page: number; isRead?: boolean; type?: NotificationType }>,
  enabled?: MaybeRefOrGetter<boolean>,
) {
  return useApiQuery({
    key: () => ['notifications', 'list', toValue(params)],
    fn: () => notificationsApi.list({ ...toValue(params), limit: 20 }),
    keepPrevious: true,
    enabled,
  });
}

/**
 * Marking as read is safe to show instantly (optimistic): the list and the
 * badge update at once and roll back if the server refuses.
 */
export function useMarkRead() {
  const queryClient = useQueryClient();
  const toast = useToastStore();
  return useMutation({
    mutationFn: async (ids: string[] | 'all'): Promise<void> => {
      if (ids === 'all') await notificationsApi.markAllRead();
      else await Promise.all(ids.map(notificationsApi.markRead));
    },
    onMutate: async (ids): Promise<{ snapshot: [QueryKey, unknown][] }> => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const lists = queryClient.getQueriesData<Page>({ queryKey: ['notifications', 'list'] });
      const counts = queryClient.getQueriesData<{ count: number }>({ queryKey: ['notifications', 'unread-count'] });
      const isTarget = (n: NotificationResponseDto) => !n.isRead && (ids === 'all' || ids.includes(n.id));
      let changed = 0;
      for (const [key, page] of lists) {
        if (!page) continue;
        changed = Math.max(changed, page.items.filter(isTarget).length);
        queryClient.setQueryData<Page>(key, {
          ...page,
          items: page.items.map((n) => (isTarget(n) ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
        });
      }
      for (const [key, value] of counts) {
        if (value) queryClient.setQueryData(key, { count: ids === 'all' ? 0 : Math.max(value.count - changed, 0) });
      }
      return { snapshot: [...lists, ...counts] as [QueryKey, unknown][] };
    },
    onError: (error, _ids, context) => {
      for (const [key, value] of context?.snapshot ?? []) queryClient.setQueryData(key, value);
      toast.error(apiErrorMessage(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

<script setup lang="ts">
import {
  AlarmClock,
  Bell,
  Megaphone,
  PartyPopper,
  CheckCheck,
  CheckSquare,
  CircleAlert,
  HandCoins,
  Magnet,
  UserX,
  Wallet,
} from 'lucide-vue-next';
import { computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { useFormatters } from '@/composables/useFormatters';
import type { NotificationResponseDto } from '@/services/api/schema.gen';
import { useListState } from '@/services/query/useListState';
import { type NotificationType, useMarkRead, useNotifications, useUnreadCount } from '../api';
import { notificationTarget } from '../targets';

/** The inbox: unread first, one tap opens the record it is about (and marks it read). */
withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });
const { t } = useI18n();
const router = useRouter();
const format = useFormatters();
const list = useListState({ show: 'unread', type: '', page: 1 }, ['type']);
const notifications = useNotifications(() => ({
  page: list.state.page,
  isRead: list.state.show === 'unread' ? false : undefined,
  type: (list.state.type || undefined) as NotificationType | undefined,
}));
const unread = useUnreadCount();
const markRead = useMarkRead();

const TYPES: NotificationType[] = [
  'TASK_ASSIGNED', 'TASK_DUE', 'TASK_OVERDUE', 'PAYMENT_RECEIVED', 'PAYMENT_DUE', 'PAYMENT_OVERDUE',
  'ATTENDANCE_ABSENT', 'ATTENDANCE_LATE', 'LEAD_ASSIGNED', 'LEAD_FOLLOW_UP', 'SYSTEM', 'ANNOUNCEMENT', 'CONGRATULATION',
];
const icons: Record<NotificationType, Component> = {
  TASK_ASSIGNED: CheckSquare,
  TASK_DUE: AlarmClock,
  TASK_OVERDUE: CircleAlert,
  PAYMENT_RECEIVED: HandCoins,
  PAYMENT_DUE: Wallet,
  PAYMENT_OVERDUE: CircleAlert,
  ATTENDANCE_ABSENT: UserX,
  ATTENDANCE_LATE: AlarmClock,
  LEAD_ASSIGNED: Magnet,
  LEAD_FOLLOW_UP: AlarmClock,
  SYSTEM: Bell,
  ANNOUNCEMENT: Megaphone,
  CONGRATULATION: PartyPopper,
};
const typeOptions = computed(() => TYPES.map((value) => ({ value, label: t(`notifications.types.${value}`) })));
const showOptions = computed(() => [
  { value: 'unread', label: t('notifications.unread') },
  { value: 'all', label: t('common.all') },
]);

async function open(n: NotificationResponseDto): Promise<void> {
  if (!n.isRead) markRead.mutate([n.id]);
  const to = notificationTarget(n);
  if (to) await router.push(to);
}
</script>

<template>
  <div>
    <PageHeader v-if="!embedded" :title="$t('nav.notifications')" :description="$t('notifications.subtitle')">
      <template #actions>
        <AppButton v-if="(unread.data.value ?? 0) > 0" variant="secondary" :icon="CheckCheck" @click="markRead.mutate('all')">{{ $t('notifications.markAll') }}</AppButton>
      </template>
    </PageHeader>
    <div v-else-if="(unread.data.value ?? 0) > 0" class="mb-3 flex justify-end">
      <AppButton variant="secondary" size="sm" :icon="CheckCheck" @click="markRead.mutate('all')">{{ $t('notifications.markAll') }}</AppButton>
    </div>
    <ListToolbar :active-filters="list.activeFilters.value" @reset="list.set({ type: '' })">
      <template #filters>
        <FilterSelect :model-value="list.state.type" :label="$t('notifications.type')" :options="typeOptions" @update:model-value="list.set({ type: $event })" />
      </template>
      <template #actions>
        <SegmentedControl :model-value="list.state.show" name="notification-show" :label="$t('notifications.show')" :options="showOptions" @update:model-value="list.set({ show: $event })" />
      </template>
    </ListToolbar>
    <ListPage
      :loading="notifications.isPending.value"
      :error="notifications.error.value"
      :meta="notifications.data.value?.meta"
      :page="list.state.page"
      :empty-title="list.state.show === 'unread' ? $t('notifications.allCaughtUp') : $t('notifications.empty')"
      :empty-text="list.state.show === 'unread' ? $t('notifications.allCaughtUpText') : undefined"
      @update:page="list.set({ page: $event })"
      @retry="notifications.refetch()"
    >
      <ul>
        <li v-for="n in notifications.data.value?.items ?? []" :key="n.id" class="border-t border-border first:border-0">
          <div class="flex items-start gap-3 px-4 py-3.5 sm:px-5" :class="!n.isRead && 'bg-primary-soft/40'">
            <span
              class="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl"
              :class="n.priority === 'URGENT' || n.priority === 'HIGH' ? 'bg-danger-soft text-danger' : 'bg-surface-muted text-fg-muted'"
            >
              <component :is="icons[n.type]" class="size-4.5" aria-hidden="true" />
            </span>
            <button type="button" class="focus-ring min-w-0 flex-1 rounded text-left" @click="open(n)">
              <span class="flex items-center gap-2">
                <span v-if="!n.isRead" class="size-2 shrink-0 rounded-full bg-primary" :aria-label="$t('notifications.unread')" />
                <span class="truncate text-sm" :class="n.isRead ? 'text-fg' : 'font-semibold text-fg'">{{ n.title }}</span>
              </span>
              <span class="mt-0.5 block text-sm text-fg-muted">{{ n.message }}</span>
              <span class="mt-1 block text-xs text-fg-subtle">{{ format.relative(n.createdAt) }}</span>
            </button>
            <AppButton v-if="!n.isRead" variant="ghost" size="sm" icon-only :icon="CheckCheck" :label="$t('notifications.markRead')" @click="markRead.mutate([n.id])" />
          </div>
        </li>
      </ul>
    </ListPage>
  </div>
</template>

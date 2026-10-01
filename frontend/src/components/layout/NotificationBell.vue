<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
import { Bell, CheckCheck } from 'lucide-vue-next';
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRouter } from 'vue-router';
import { P } from '@/app/config/permissions';
import AppButton from '@/components/ui/AppButton.vue';
import AppSpinner from '@/components/ui/AppSpinner.vue';
import { useFormatters } from '@/composables/useFormatters';
import { useMarkRead, useNotifications, useUnreadCount } from '@/features/notifications/api';
import { notificationTarget } from '@/features/notifications/targets';
import type { NotificationResponseDto } from '@/services/api/schema.gen';
import { useSessionStore } from '@/stores/session.store';

/**
 * Notification center: the badge, and on click the latest notifications —
 * open one to go to its record (it is marked read), or mark all read.
 */
const session = useSessionStore();
const { t } = useI18n();
const router = useRouter();
const format = useFormatters();
const panelId = useId();
const root = ref<HTMLElement>();
const open = ref(false);
const { data: unread } = useUnreadCount();
const latest = useNotifications(() => ({ page: 1 }), open);
const markRead = useMarkRead();
const items = computed(() => latest.data.value?.items.slice(0, 6) ?? []);
const label = computed(() =>
  unread.value ? `${t('header.notifications')}, ${t('header.unread', { count: unread.value })}` : t('header.notifications'),
);

onClickOutside(root, () => (open.value = false));

async function openItem(n: NotificationResponseDto): Promise<void> {
  open.value = false;
  if (!n.isRead) markRead.mutate([n.id]);
  const to = notificationTarget(n);
  if (to) await router.push(to);
}
</script>

<template>
  <div v-if="session.can(P.NOTIFICATIONS_READ)" ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="panelId"
      class="focus-ring relative inline-flex size-11 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-hover hover:text-fg sm:size-10"
      @click="open = !open"
    >
      <Bell class="size-5" aria-hidden="true" />
      <span
        v-if="unread"
        class="absolute top-1.5 right-1.5 inline-flex min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[0.65rem] leading-4.5 font-semibold text-white"
        aria-hidden="true"
      >
        {{ unread > 99 ? '99+' : unread }}
      </span>
    </button>

    <section
      v-if="open"
      :id="panelId"
      :aria-label="$t('header.notifications')"
      class="glass-strong fixed inset-x-3 top-16 z-50 flex max-h-[70dvh] flex-col rounded-2xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96"
    >
      <header class="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 class="text-sm font-semibold text-fg">{{ $t('header.notifications') }}</h2>
        <AppButton v-if="unread" size="sm" variant="ghost" :icon="CheckCheck" @click="markRead.mutate('all')">{{ $t('notifications.markAll') }}</AppButton>
      </header>
      <div class="flex-1 overflow-y-auto p-1.5">
        <div v-if="latest.isPending.value" class="flex justify-center py-8"><AppSpinner /></div>
        <p v-else-if="items.length === 0" class="px-3 py-8 text-center text-sm text-fg-muted">{{ $t('notifications.allCaughtUpText') }}</p>
        <ul v-else>
          <li v-for="n in items" :key="n.id">
            <button
              type="button"
              class="focus-ring flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-surface-hover"
              :class="!n.isRead && 'bg-primary-soft/40'"
              @click="openItem(n)"
            >
              <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="n.isRead ? 'bg-transparent' : 'bg-primary'" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-fg" :class="!n.isRead && 'font-semibold'">{{ n.title }}</span>
                <span class="line-clamp-2 block text-xs text-fg-muted">{{ n.message }}</span>
                <span class="block text-xs text-fg-subtle">{{ format.relative(n.createdAt) }}</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
      <footer class="border-t border-border p-2">
        <RouterLink :to="{ name: 'notifications' }" class="focus-ring block rounded-xl px-3 py-2 text-center text-sm font-medium text-primary-text hover:bg-surface-hover" @click="open = false">
          {{ $t('common.seeAll') }}
        </RouterLink>
      </footer>
    </section>
  </div>
</template>

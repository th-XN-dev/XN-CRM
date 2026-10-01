<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';
import { P } from '@/app/config/permissions';
import QueryState from '@/components/feedback/QueryState.vue';
import AppSwitch from '@/components/ui/AppSwitch.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { usePermission } from '@/composables/usePermission';
import { notificationsApi } from '@/features/notifications/api';
import type { NotificationPreferenceResponseDto } from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';
import { useToastStore } from '@/stores/toast.store';
import SettingsPanel from './SettingsPanel.vue';

/**
 * Which notifications reach me, and where. A switch flips immediately
 * (optimistic) and flips back if the server refuses; locked channels of
 * critical types cannot be turned off.
 */
type Channel = 'inAppEnabled' | 'telegramEnabled' | 'emailEnabled' | 'smsEnabled';
const CHANNELS: { key: Channel; code: string }[] = [
  { key: 'inAppEnabled', code: 'IN_APP' },
  { key: 'telegramEnabled', code: 'TELEGRAM' },
  { key: 'emailEnabled', code: 'EMAIL' },
  { key: 'smsEnabled', code: 'SMS' },
];
const KEY = ['notifications', 'preferences'];
const { can } = usePermission();
const toast = useToastStore();
const queryClient = useQueryClient();
const preferences = useApiQuery({ key: KEY, fn: notificationsApi.preferences });
const editable = computed(() => can(P.NOTIFICATION_PREFERENCES_UPDATE));

const toggle = useMutation({
  mutationFn: ({ row, channel, value }: { row: NotificationPreferenceResponseDto; channel: Channel; value: boolean }) =>
    notificationsApi.updatePreferences([{ type: row.type, [channel]: value }]),
  onMutate: async ({ row, channel, value }) => {
    const keys = queryClient.getQueriesData<NotificationPreferenceResponseDto[]>({ queryKey: KEY });
    for (const [key, rows] of keys) {
      queryClient.setQueryData(key, rows?.map((r) => (r.type === row.type ? { ...r, [channel]: value } : r)));
    }
    return { keys };
  },
  onError: (error, _vars, context) => {
    for (const [key, rows] of context?.keys ?? []) queryClient.setQueryData(key, rows);
    toast.error(apiErrorMessage(error));
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
});
</script>

<template>
  <SettingsPanel :title="$t('settings.notifications.title')" :description="$t('settings.notifications.text')">
    <QueryState :loading="preferences.isPending.value" :error="preferences.error.value" @retry="preferences.refetch()">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <caption class="sr-only">{{ $t('settings.notifications.title') }}</caption>
          <thead>
            <tr class="text-xs text-fg-muted">
              <th scope="col" class="py-2 pr-4 text-left font-medium">{{ $t('notifications.type') }}</th>
              <th v-for="channel in CHANNELS" :key="channel.key" scope="col" class="px-2 py-2 text-center font-medium">{{ $t(`settings.notifications.channels.${channel.code}`) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in preferences.data.value ?? []" :key="row.type" class="border-t border-border">
              <th scope="row" class="py-3 pr-4 text-left font-normal text-fg">{{ $t(`notifications.types.${row.type}`) }}</th>
              <td v-for="channel in CHANNELS" :key="channel.key" class="px-2 py-3 text-center">
                <div class="inline-flex">
                  <AppSwitch
                    :model-value="row[channel.key]"
                    :label="`${$t(`notifications.types.${row.type}`)} — ${$t(`settings.notifications.channels.${channel.code}`)}`"
                    hide-label
                    :disabled="!editable || (row.lockedChannels as readonly string[]).includes(channel.code)"
                    @update:model-value="toggle.mutate({ row, channel: channel.key, value: $event })"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-4 text-xs text-fg-muted">{{ $t('settings.notifications.lockedHint') }}</p>
    </QueryState>
  </SettingsPanel>
</template>

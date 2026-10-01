<script setup lang="ts">
import { History } from 'lucide-vue-next';
import EmptyState from '@/components/feedback/EmptyState.vue';
import { useFormatters } from '@/composables/useFormatters';
import { api } from '@/services/api/http';
import type { AuditLogResponseDto } from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';
import type { Paginated } from '@/types/api';
import { useDescribeAction } from './describe';

/** Who changed this record and when (the audit trail; owners/admins with audit.read). */
const props = defineProps<{ entityType: string; entityId: string }>();
const format = useFormatters();
const log = useApiQuery({
  key: () => ['audit', props.entityType, props.entityId],
  fn: () =>
    api.get<Paginated<AuditLogResponseDto>>('/audit-logs', {
      params: { entityType: props.entityType, entityId: props.entityId, limit: 50 },
    }),
});

const describe = useDescribeAction();
</script>

<template>
  <EmptyState v-if="log.data.value?.items.length === 0" compact :icon="History" :text="$t('activity.empty')" />
  <ol v-else class="flex flex-col">
    <li v-for="entry in log.data.value?.items ?? []" :key="entry.id" class="flex gap-3 border-b border-border py-3 last:border-0">
      <span class="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      <div class="min-w-0">
        <p class="text-sm text-fg">
          <strong class="font-medium">{{ entry.user?.name ?? $t('activity.system') }}</strong>
          {{ describe(entry.action) }}
        </p>
        <p class="text-xs text-fg-muted">{{ format.dateTime(entry.createdAt) }}</p>
      </div>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { History } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import ListPage from '@/components/data/ListPage.vue';
import { useFormatters } from '@/composables/useFormatters';
import { useDescribeAction } from '@/features/audit/describe';
import { useCenters } from '@/features/centers/api';
import { useManagementAudit } from '../api';

/** Who did what to which center, when (the owner's management trail). */
const props = defineProps<{ centerId?: string }>();
const format = useFormatters();
const describe = useDescribeAction();
const page = ref(1);
watch(() => props.centerId, () => (page.value = 1));
const log = useManagementAudit(() => ({ page: page.value, centerId: props.centerId }));
// Names for the rows (only needed when the list spans several centers).
const centers = useCenters(() => ({ limit: 100, sortBy: 'name' as const, sortOrder: 'asc' as const }));
const names = computed(() => new Map((centers.data.value?.items ?? []).map((c) => [c.id, c.name])));
/** A deleted center is no longer listed; its audit row remembers the name. */
function centerName(entry: { organizationId: string | null; oldData: unknown }): string {
  const remembered = (entry.oldData as { name?: unknown } | null)?.name;
  return names.value.get(entry.organizationId ?? '') ?? (typeof remembered === 'string' ? remembered : '…');
}
const exists = (id: string) => names.value.has(id);
</script>

<template>
  <ListPage
    v-model:page="page"
    plain
    :loading="log.isPending.value"
    :error="log.error.value"
    :meta="log.data.value?.meta"
    :empty-title="$t('owner.platform.empty')"
    @retry="log.refetch()"
  >
    <ol class="flex flex-col rounded-2xl border border-border bg-surface px-4 shadow-card" :aria-label="$t('owner.platform.activity')">
      <li v-for="entry in log.data.value?.items ?? []" :key="entry.id" class="flex gap-3 border-b border-border py-3 last:border-0">
        <History class="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        <div class="min-w-0">
          <p class="text-sm text-fg">
            <strong class="font-medium">{{ entry.user?.name ?? $t('owner.platform.system') }}</strong>
            {{ describe(entry.action) }}
            <template v-if="!centerId && entry.organizationId">
              <RouterLink
                v-if="exists(entry.organizationId)"
                :to="{ name: 'owner-center', params: { id: entry.organizationId } }"
                class="focus-ring rounded font-medium text-primary-text"
              >{{ centerName(entry) }}</RouterLink>
              <span v-else class="font-medium">{{ centerName(entry) }}</span>
            </template>
          </p>
          <p class="text-xs text-fg-muted">{{ format.dateTime(entry.createdAt) }}</p>
        </div>
      </li>
    </ol>
  </ListPage>
</template>

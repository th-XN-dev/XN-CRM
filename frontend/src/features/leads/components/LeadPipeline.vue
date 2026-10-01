<script setup lang="ts">
import { ArrowRight, CalendarClock, GripVertical, Phone } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import AppBadge from '@/components/ui/AppBadge.vue';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import type { LeadListItemDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { LEAD_KEYS, leadsApi, PIPELINE, type LeadListParams, type LeadStatus } from '../api';
import { useLeads } from '../queries';
import ConvertLeadModal from './ConvertLeadModal.vue';
import LeadStatusModal from './LeadStatusModal.vue';

/**
 * Funnel board. Drag a card to another column, or use its "move" button
 * (keyboard and touch). Dropping on "Converted" opens the conversion form;
 * nothing moves until the server has accepted it.
 */
const props = defineProps<{ filters: LeadListParams }>();
const { t } = useI18n();
const { can } = usePermission();
const format = useFormatters();
const canMove = computed(() => can(P.LEADS_UPDATE));
const columns = PIPELINE.map((status) => ({
  status,
  query: useLeads(() => ({ ...props.filters, status, page: 1, limit: 30, sortBy: 'updatedAt', sortOrder: 'desc' })),
}));
const dragging = ref<LeadListItemDto | null>(null);
const over = ref<LeadStatus | null>(null);
const statusLead = ref<{ id: string; name: string; status: LeadStatus } | null>(null);
const statusTarget = ref<LeadStatus | null>(null);
const statusOpen = ref(false);
const converting = ref<LeadListItemDto | null>(null);
const convertOpen = ref(false);

const move = useApiMutation({
  fn: ({ lead, status }: { lead: LeadListItemDto; status: LeadStatus }) => leadsApi.changeStatus(lead.id, status),
  invalidates: LEAD_KEYS,
  success: (_, { status }) => t('leads.statusChanged', { status: t(`status.lead.${status}`) }),
  toastError: true,
});

function request(lead: LeadListItemDto, status: LeadStatus | null): void {
  if (status === lead.status) return;
  if (status === 'CONVERTED') {
    if (!can(P.LEADS_CONVERT)) return;
    converting.value = lead;
    convertOpen.value = true;
    return;
  }
  if (status && status !== 'LOST') {
    move.mutate({ lead, status });
    return;
  }
  statusLead.value = { id: lead.id, name: lead.name, status: lead.status };
  statusTarget.value = status;
  statusOpen.value = true;
}

function onDrop(status: LeadStatus): void {
  const lead = dragging.value;
  dragging.value = null;
  over.value = null;
  if (lead) request(lead, status);
}
</script>

<template>
  <div class="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
    <div class="flex gap-3" :class="move.isPending.value && 'opacity-70'">
      <section
        v-for="column in columns"
        :key="column.status"
        class="flex max-h-[70dvh] w-72 shrink-0 flex-col rounded-2xl border bg-surface-muted/60 transition-colors"
        :class="over === column.status ? 'border-primary bg-primary-soft/50' : 'border-border'"
        :aria-label="$t(`status.lead.${column.status}`)"
        @dragover.prevent="canMove && (over = column.status)"
        @dragleave="over = over === column.status ? null : over"
        @drop.prevent="onDrop(column.status)"
      >
        <header class="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
          <h3 class="text-sm font-semibold text-fg">{{ $t(`status.lead.${column.status}`) }}</h3>
          <span class="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg-muted tabular-nums">{{ column.query.data.value?.meta.total ?? '…' }}</span>
        </header>
        <ul class="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
          <li
            v-for="lead in column.query.data.value?.items ?? []"
            :key="lead.id"
            :draggable="canMove && column.status !== 'CONVERTED'"
            class="group rounded-xl border border-border bg-surface p-3 shadow-card"
            :class="dragging?.id === lead.id && 'opacity-50'"
            @dragstart="dragging = lead"
            @dragend="dragging = null; over = null"
          >
            <div class="flex items-start gap-2">
              <GripVertical v-if="canMove && column.status !== 'CONVERTED'" class="mt-0.5 hidden size-4 shrink-0 cursor-grab text-fg-subtle sm:block" aria-hidden="true" />
              <RouterLink :to="{ name: 'lead', params: { id: lead.id } }" class="focus-ring min-w-0 flex-1 rounded">
                <span class="block truncate text-sm font-medium text-fg">{{ lead.name }}</span>
                <span class="flex items-center gap-1 text-xs text-fg-muted"><Phone class="size-3" aria-hidden="true" />{{ lead.phone }}</span>
              </RouterLink>
              <button
                v-if="canMove && column.status !== 'CONVERTED'"
                type="button"
                class="focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg"
                :aria-label="$t('leads.moveLead', { name: lead.name })"
                @click="request(lead, null)"
              >
                <ArrowRight class="size-4" aria-hidden="true" />
              </button>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <AppBadge v-if="lead.priority === 'HIGH'" tone="danger">{{ $t('status.leadPriority.HIGH') }}</AppBadge>
              <AppBadge v-if="lead.source">{{ lead.source.name }}</AppBadge>
              <span
                v-if="lead.nextFollowUpAt"
                class="inline-flex items-center gap-1 text-xs"
                :class="new Date(lead.nextFollowUpAt) < new Date() ? 'text-danger' : 'text-fg-muted'"
              >
                <CalendarClock class="size-3" aria-hidden="true" />{{ format.relative(lead.nextFollowUpAt) }}
              </span>
            </div>
            <p v-if="lead.assignedTo" class="mt-1.5 truncate text-xs text-fg-subtle">{{ lead.assignedTo.name }}</p>
          </li>
          <li v-if="column.query.data.value?.items.length === 0" class="px-2 py-6 text-center text-xs text-fg-subtle">{{ $t('leads.emptyColumn') }}</li>
        </ul>
      </section>
    </div>
  </div>
  <LeadStatusModal v-model:open="statusOpen" :lead="statusLead" :target="statusTarget" />
  <ConvertLeadModal v-model:open="convertOpen" :lead="converting" />
</template>

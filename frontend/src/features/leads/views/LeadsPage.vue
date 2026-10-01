<script setup lang="ts">
import { Columns3, List, Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { P } from '@/app/config/permissions';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useMembers } from '@/features/organizations/queries';
import type { LeadListItemDto } from '@/services/api/schema.gen';
import { useListState } from '@/services/query/useListState';
import { LEAD_PRIORITIES, LEAD_STATUSES, type LeadListParams } from '../api';
import LeadFormModal from '../components/LeadFormModal.vue';
import LeadPipeline from '../components/LeadPipeline.vue';
import { useFollowUps, useLeadSources, useLeads } from '../queries';

const { t } = useI18n();
const { can } = usePermission();
const router = useRouter();
const format = useFormatters();
const branches = useBranchOptions();
const sources = useLeadSources();
const members = useMembers();
const list = useListState(
  { view: 'table', followUp: '', page: 1, search: '', status: '', priority: '', sourceId: '', assignedToId: '', branchId: '', sortBy: 'createdAt', sortOrder: 'desc' },
  ['status', 'priority', 'sourceId', 'assignedToId', 'branchId'],
);
const filters = computed<LeadListParams>(() => ({
  search: list.state.search || undefined,
  priority: (list.state.priority || undefined) as LeadListParams['priority'],
  sourceId: list.state.sourceId || undefined,
  assignedToId: list.state.assignedToId || undefined,
  branchId: list.state.branchId || undefined,
}));
const followUpFilter = computed(() => (list.state.followUp || undefined) as 'today' | 'overdue' | undefined);
const leads = useLeads(
  () => ({
    ...filters.value,
    status: (list.state.status || undefined) as LeadListParams['status'],
    page: list.state.page,
    limit: 20,
    sortBy: list.state.sortBy as LeadListParams['sortBy'],
    sortOrder: list.state.sortOrder as 'asc' | 'desc',
  }),
  () => list.state.view === 'table' && !followUpFilter.value,
);
const followUps = useFollowUps(followUpFilter, () => !!followUpFilter.value);
const todayCount = useFollowUps('today');
const overdueCount = useFollowUps('overdue');
const table = computed(() => (followUpFilter.value ? followUps : leads));
const creating = ref(false);

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('leads.name'), sortable: true },
  { key: 'phone', label: t('common.phone') },
  { key: 'source', label: t('leads.source'), wide: true },
  { key: 'status', label: t('common.status'), sortable: true },
  { key: 'priority', label: t('leads.priority'), sortable: true, wide: true },
  { key: 'assignedTo', label: t('leads.assignee') },
  { key: 'nextFollowUpAt', label: t('leads.followUp'), sortable: true },
]);
const viewOptions = computed(() => [
  { value: 'table', label: t('leads.table'), icon: List },
  { value: 'pipeline', label: t('leads.pipeline'), icon: Columns3 },
]);
const statusOptions = computed(() => LEAD_STATUSES.map((value) => ({ value, label: t(`status.lead.${value}`) })));
const priorityOptions = computed(() => LEAD_PRIORITIES.map((value) => ({ value, label: t(`status.leadPriority.${value}`) })));
const overdue = (lead: LeadListItemDto) => !!lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.leads')" :description="$t('leads.subtitle')">
      <template #actions>
        <SegmentedControl :model-value="list.state.view" name="leads-view" :label="$t('leads.view')" :options="viewOptions" @update:model-value="list.set({ view: $event })" />
        <AppButton v-if="can(P.LEADS_CREATE)" :icon="Plus" @click="creating = true">{{ $t('leads.new') }}</AppButton>
      </template>
    </PageHeader>

    <div class="mb-4 flex flex-wrap gap-2">
      <button
        v-for="chip in [
          { key: 'today', count: todayCount.data.value?.meta.total ?? 0, tone: 'warning' },
          { key: 'overdue', count: overdueCount.data.value?.meta.total ?? 0, tone: 'danger' },
        ]"
        :key="chip.key"
        type="button"
        class="focus-ring inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors"
        :class="list.state.followUp === chip.key ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border bg-surface text-fg-muted hover:text-fg'"
        :aria-pressed="list.state.followUp === chip.key"
        @click="list.set({ followUp: list.state.followUp === chip.key ? '' : chip.key, view: 'table' })"
      >
        {{ $t(`leads.followUps.${chip.key}`) }}
        <span class="rounded-full px-1.5 text-xs tabular-nums" :class="chip.count ? (chip.tone === 'danger' ? 'bg-danger text-white' : 'bg-warning text-black') : 'bg-surface-muted'">{{ chip.count }}</span>
      </button>
    </div>

    <ListToolbar
      :search="list.state.search"
      :search-label="$t('leads.search')"
      :active-filters="list.activeFilters.value"
      @update:search="list.set({ search: $event })"
      @reset="list.set({ status: '', priority: '', sourceId: '', assignedToId: '', branchId: '' })"
    >
      <template #filters>
        <FilterSelect v-if="list.state.view === 'table'" :model-value="list.state.status" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ status: $event })" />
        <FilterSelect :model-value="list.state.priority" :label="$t('leads.priority')" :options="priorityOptions" @update:model-value="list.set({ priority: $event })" />
        <FilterSelect v-if="sources.options.value.length" :model-value="list.state.sourceId" :label="$t('leads.source')" :options="sources.options.value" @update:model-value="list.set({ sourceId: $event })" />
        <FilterSelect v-if="members.options.value.length" :model-value="list.state.assignedToId" :label="$t('leads.assignee')" :options="members.options.value" @update:model-value="list.set({ assignedToId: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
      </template>
    </ListToolbar>

    <LeadPipeline v-if="list.state.view === 'pipeline'" :filters="filters" />

    <ListPage
      v-else
      :create-label="can(P.LEADS_CREATE) && !followUpFilter && !list.state.search && list.activeFilters.value === 0 ? $t('leads.new') : undefined"
      :loading="table.isPending.value"
      :error="table.error.value"
      :meta="table.data.value?.meta"
      :page="followUpFilter ? 1 : list.state.page"
      :empty-title="followUpFilter ? $t('leads.noFollowUps') : $t('leads.emptyTitle')"
      :empty-text="followUpFilter ? undefined : $t('leads.emptyText')"
      @create="creating = true"
      @update:page="list.set({ page: $event })"
      @retry="table.refetch()"
    >
      <DataTable
        columns-id="leads"
        :columns="columns"
        :rows="table.data.value?.items ?? []"
        :row-key="(row: LeadListItemDto) => row.id"
        :row-to="(row: LeadListItemDto) => ({ name: 'lead', params: { id: row.id } })"
        :caption="$t('nav.leads')"
        :loading="table.isFetching.value"
        :sort="followUpFilter ? undefined : { sortBy: list.state.sortBy, sortOrder: list.state.sortOrder as 'asc' | 'desc' }"
        @sort="list.set($event)"
      >
        <template #cell-source="{ row }">{{ row.source?.name ?? '—' }}</template>
        <template #cell-status="{ row }"><StatusBadge kind="lead" :value="row.status" /></template>
        <template #cell-priority="{ row }"><StatusBadge kind="leadPriority" :value="row.priority" /></template>
        <template #cell-assignedTo="{ row }"><span :class="!row.assignedTo && 'text-fg-subtle'">{{ row.assignedTo?.name ?? $t('common.unassigned') }}</span></template>
        <template #cell-nextFollowUpAt="{ row }">
          <span v-if="row.nextFollowUpAt" :class="overdue(row) ? 'font-medium text-danger' : 'text-fg'">{{ format.dateTime(row.nextFollowUpAt) }}</span>
          <span v-else class="text-fg-subtle">—</span>
        </template>
        <template #mobile="{ row }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-fg">{{ row.name }}</p>
              <p class="truncate text-sm text-fg-muted">{{ row.phone }}<template v-if="row.source"> · {{ row.source.name }}</template></p>
              <p v-if="row.nextFollowUpAt" class="text-xs" :class="overdue(row) ? 'text-danger' : 'text-fg-muted'">{{ format.relative(row.nextFollowUpAt) }}</p>
            </div>
            <StatusBadge kind="lead" :value="row.status" />
          </div>
        </template>
      </DataTable>
    </ListPage>
    <LeadFormModal v-model:open="creating" @saved="(lead) => router.push({ name: 'lead', params: { id: lead.id } })" />
  </div>
</template>

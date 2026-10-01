<script setup lang="ts">
import { Archive, Plus, Trash2, X } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import OrgTile from '@/components/ui/OrgTile.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import type { CenterDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useListState } from '@/services/query/useListState';
import { useToastStore } from '@/stores/toast.store';
import { CENTER_STATUSES, type CenterListParams, centersApi, useCenters } from '../api';
import DeleteCentersDialog from '../components/DeleteCentersDialog.vue';

const { t } = useI18n();
const format = useFormatters();
const confirm = useConfirm();
const toast = useToastStore();
const list = useListState({ page: 1, limit: 20, search: '', status: '', sortBy: 'createdAt', sortOrder: 'desc' }, ['status']);
const centers = useCenters(() => list.params.value as CenterListParams);
const perPageOptions = computed(() => [50, 100].map((n) => ({ value: String(n), label: t('owner.centers.perPage', { count: n }) })));

// Selection survives paging (select on several pages, then act once).
const selected = ref<string[]>([]);
const known = reactive(new Map<string, CenterDto>());
watch(
  () => centers.data.value?.items,
  (items) => items?.forEach((center) => known.set(center.id, center)),
  { immediate: true },
);
const selectedCenters = computed(() => selected.value.map((id) => known.get(id)).filter((c): c is CenterDto => !!c));
const deleteOpen = ref(false);

const archive = useApiMutation({
  fn: (ids: string[]) => centersApi.bulk({ action: 'archive', ids }),
  invalidates: [['owner']],
  toastError: true,
  onSuccess: (result) => {
    for (const r of result.results) {
      const center = known.get(r.id);
      if (r.ok && center) known.set(r.id, { ...center, status: 'ARCHIVED', availability: 'ARCHIVED' });
    }
    toast.success(t('owner.centers.bulk.archived', { count: result.succeeded }));
    if (result.failed) toast.warning(t('owner.centers.bulk.partly', { failed: result.failed }));
  },
});
async function archiveSelected(): Promise<void> {
  const ids = selectedCenters.value.filter((c) => c.status !== 'ARCHIVED').map((c) => c.id);
  if (!ids.length) return;
  const ok = await confirm({
    title: t('owner.centers.bulk.archiveTitle', { count: ids.length }),
    message: t('owner.centers.bulk.archiveText'),
    confirmLabel: t('owner.centers.bulk.archive'),
    danger: true,
  });
  if (ok) await archive.mutateAsync(ids);
}
/** From the delete dialog: archive the ones that aren't yet, then ask again. */
async function archiveThenDelete(pending: CenterDto[]): Promise<void> {
  deleteOpen.value = false;
  await archive.mutateAsync(pending.map((c) => c.id));
  deleteOpen.value = true;
}
function onDeleted(ids: string[]): void {
  selected.value = selected.value.filter((id) => !ids.includes(id));
  ids.forEach((id) => known.delete(id));
}

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('owner.centers.name'), sortable: true },
  { key: 'status', label: t('owner.centers.status') },
  { key: 'period', label: t('owner.centers.period'), sortable: true, sortKey: 'activeUntil' },
  { key: 'directors', label: t('owner.centers.directors'), wide: true },
  { key: 'counts', label: t('owner.centers.branches'), align: 'right', wide: true },
  { key: 'createdAt', label: t('owner.centers.createdAt'), sortable: true, wide: true },
]);
const statusOptions = computed(() => CENTER_STATUSES.map((value) => ({ value, label: t(`status.center.${value}`) })));
const period = (center: CenterDto) =>
  center.activeUntil
    ? `${center.activeFrom ? format.day(center.activeFrom) : '…'} — ${format.day(center.activeUntil)}`
    : t('owner.centers.openEnded');
</script>

<template>
  <div>
    <PageHeader :title="$t('owner.centers.title')" :description="$t('owner.centers.subtitle')">
      <template #actions>
        <AppButton :icon="Plus" @click="$router.push({ name: 'owner-center-new' })">{{ $t('owner.centers.new') }}</AppButton>
      </template>
    </PageHeader>
    <ListToolbar
      :search="list.state.search"
      :search-label="$t('owner.centers.search')"
      :active-filters="list.activeFilters.value"
      @update:search="list.set({ search: $event })"
      @reset="list.reset()"
    >
      <template #filters>
        <FilterSelect :model-value="list.state.status" :label="$t('owner.centers.status')" :options="statusOptions" @update:model-value="list.set({ status: $event })" />
        <FilterSelect
          :model-value="list.state.limit === 20 ? '' : String(list.state.limit)"
          :label="$t('table.perPage')"
          :options="perPageOptions"
          :all-label="$t('owner.centers.perPage', { count: 20 })"
          @update:model-value="list.set({ limit: Number($event) || 20 })"
        />
      </template>
    </ListToolbar>

    <div
      v-if="selected.length"
      class="sticky top-20 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-primary-soft px-4 py-2 shadow-card"
      role="region"
      :aria-label="$t('table.selected', { count: selected.length })"
    >
      <span class="mr-auto text-sm font-medium text-primary-soft-fg" aria-live="polite">{{ $t('table.selected', { count: selected.length }) }}</span>
      <AppButton variant="secondary" size="sm" :icon="Archive" :loading="archive.isPending.value" @click="archiveSelected">{{ $t('owner.centers.bulk.archive') }}</AppButton>
      <AppButton variant="danger" size="sm" :icon="Trash2" @click="deleteOpen = true">{{ $t('owner.centers.bulk.delete') }}</AppButton>
      <AppButton variant="ghost" size="sm" :icon="X" @click="selected = []">{{ $t('table.clearSelection') }}</AppButton>
    </div>
    <ListPage
      :create-label="!list.state.search && !list.state.status ? $t('owner.centers.new') : undefined"
      :loading="centers.isPending.value"
      :error="centers.error.value"
      :meta="centers.data.value?.meta"
      :page="list.state.page"
      :empty-title="list.state.search || list.state.status ? $t('common.noMatches') : $t('owner.centers.emptyTitle')"
      :empty-text="$t('owner.centers.emptyText')"
      @create="$router.push({ name: 'owner-center-new' })"
      @update:page="list.set({ page: $event })"
      @retry="centers.refetch()"
    >
      <DataTable
        v-model:selected="selected"
        selectable
        :row-label="(row: CenterDto) => row.name"
        columns-id="owner-centers"
        :columns="columns"
        :rows="centers.data.value?.items ?? []"
        :row-key="(row: CenterDto) => row.id"
        :row-to="(row: CenterDto) => ({ name: 'owner-center', params: { id: row.id } })"
        :caption="$t('owner.centers.title')"
        :loading="centers.isFetching.value"
        :sort="{ sortBy: list.state.sortBy, sortOrder: list.state.sortOrder as 'asc' | 'desc' }"
        @sort="list.set($event)"
      >
        <template #cell-name="{ row }">
          <span class="flex min-w-0 items-center gap-3">
            <OrgTile :name="row.name" :color="row.primaryColor" :logo-url="row.logoUrl" />
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ row.name }}</span>
              <span class="block truncate text-xs text-fg-muted">{{ row.slug }}</span>
            </span>
          </span>
        </template>
        <template #cell-status="{ row }"><StatusBadge kind="availability" :value="row.availability" /></template>
        <template #cell-period="{ row }"><span class="text-sm">{{ period(row) }}</span></template>
        <template #cell-directors="{ row }">
          <span v-if="row.directors.length" class="text-sm">{{ row.directors.map((d) => d.name).join(', ') }}</span>
          <span v-else class="text-sm text-warning">{{ $t('owner.centers.noDirector') }}</span>
        </template>
        <template #cell-counts="{ row }">
          <span class="text-sm tabular-nums">{{ $t('owner.centers.counts', { branches: row.counts.branches, students: row.counts.activeStudents }) }}</span>
        </template>
        <template #cell-createdAt="{ row }">{{ format.day(row.createdAt) }}</template>
        <template #mobile="{ row }">
          <div class="flex items-center gap-3">
            <OrgTile :name="row.name" :color="row.primaryColor" :logo-url="row.logoUrl" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-fg">{{ row.name }}</p>
              <p class="truncate text-sm text-fg-muted">{{ period(row) }}</p>
            </div>
            <StatusBadge kind="availability" :value="row.availability" />
          </div>
        </template>
      </DataTable>
    </ListPage>
    <DeleteCentersDialog v-model:open="deleteOpen" :centers="selectedCenters" @deleted="onDeleted" @archive-first="archiveThenDelete" />
  </div>
</template>

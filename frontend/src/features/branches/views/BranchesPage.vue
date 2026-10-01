<script setup lang="ts">
import { Pencil, Plus, Power } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useConfirm } from '@/composables/useConfirm';
import { usePermission } from '@/composables/usePermission';
import { useSubCenters } from '@/features/sub-centers/api';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useListState } from '@/services/query/useListState';
import { useSessionStore } from '@/stores/session.store';
import { type BranchDto, branchesApi, useManagedBranches } from '../api';
import BranchFormModal from '../components/BranchFormModal.vue';

const { t } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const session = useSessionStore();
const list = useListState({ subCenterId: '', isActive: '' });
const branches = useManagedBranches(() => ({
  subCenterId: list.state.subCenterId || undefined,
  isActive: list.state.isActive === '' ? undefined : list.state.isActive === 'true',
}));
const subCenters = useSubCenters(() => can(P.SUB_CENTERS_READ));
const formOpen = ref(false);
const edited = ref<BranchDto | null>(null);

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('management.branches.name') },
  { key: 'code', label: t('management.branches.code') },
  ...(subCenters.options.value.length ? [{ key: 'subCenter', label: t('management.branches.subCenter') }] : []),
  { key: 'contacts', label: t('management.branches.address'), wide: true },
  { key: 'isActive', label: t('common.status') },
]);
const statusOptions = computed(() => [
  { value: 'true', label: t('status.active.true') },
  { value: 'false', label: t('status.active.false') },
]);
const toggle = useApiMutation({
  fn: (branch: BranchDto) => branchesApi.update(branch.id, { isActive: !branch.isActive }),
  invalidates: [['branches'], ['sub-centers'], ['analytics']],
  success: (branch) => (branch.isActive ? t('management.branches.activated') : t('management.branches.deactivated')),
  toastError: true,
  onSuccess: () => session.reloadContext(),
});
async function askToggle(branch: BranchDto): Promise<void> {
  if (!branch.isActive) return toggle.mutate(branch);
  const ok = await confirm({
    title: t('management.branches.deactivateTitle', { name: branch.name }),
    message: t('management.branches.deactivateText'),
    confirmLabel: t('management.branches.deactivate'),
    danger: true,
  });
  if (ok) toggle.mutate(branch);
}
function open(branch: BranchDto | null): void {
  edited.value = branch;
  formOpen.value = true;
}
/** A branch in a frozen/archived sub-center can't be used even if it is active itself. */
const closedBySubCenter = (branch: BranchDto) => !!branch.subCenter && branch.subCenter.status !== 'ACTIVE';
</script>

<template>
  <div>
    <PageHeader :title="$t('management.branches.title')" :description="$t('management.branches.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.BRANCH_CREATE)" :icon="Plus" @click="open(null)">{{ $t('management.branches.new') }}</AppButton>
      </template>
    </PageHeader>
    <div class="mb-4 flex flex-wrap gap-3 [&>*]:w-full sm:[&>*]:w-56">
      <FilterSelect
        v-if="subCenters.options.value.length"
        :model-value="list.state.subCenterId"
        :label="$t('management.branches.subCenter')"
        :options="subCenters.options.value"
        :all-label="$t('management.branches.allSubCenters')"
        @update:model-value="list.set({ subCenterId: $event })"
      />
      <FilterSelect :model-value="list.state.isActive" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ isActive: $event })" />
    </div>
    <ListPage
      :create-label="can(P.BRANCH_CREATE) ? $t('management.branches.new') : undefined"
      :loading="branches.isPending.value"
      :error="branches.error.value"
      :meta="branches.data.value ? { page: 1, limit: branches.data.value.length || 1, total: branches.data.value.length, totalPages: 1 } : undefined"
      :empty-title="$t('management.branches.emptyTitle')"
      :empty-text="$t('management.branches.emptyText')"
      @create="open(null)"
      @retry="branches.refetch()"
    >
      <DataTable
        :columns="columns"
        :rows="branches.data.value ?? []"
        :row-key="(row: BranchDto) => row.id"
        :caption="$t('management.branches.title')"
        :loading="branches.isFetching.value"
      >
        <template #cell-subCenter="{ row }">
          <span v-if="row.subCenter">{{ row.subCenter.name }}</span>
          <span v-else class="text-fg-muted">{{ $t('management.branches.none') }}</span>
        </template>
        <template #cell-contacts="{ row }"><span class="text-sm">{{ [row.address, row.phone].filter(Boolean).join(' · ') || '—' }}</span></template>
        <template #cell-isActive="{ row }">
          <span class="flex flex-col items-start gap-1">
            <StatusBadge kind="active" :value="row.isActive" />
            <span v-if="row.isActive && closedBySubCenter(row)" class="text-xs text-warning">{{ $t('management.branches.closedBySubCenter') }}</span>
          </span>
        </template>
        <template #mobile="{ row }">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-fg">{{ row.name }} <span class="text-sm font-normal text-fg-muted">{{ row.code }}</span></p>
              <p class="truncate text-sm text-fg-muted">{{ row.subCenter?.name ?? $t('management.branches.none') }}</p>
            </div>
            <StatusBadge v-if="!row.isActive" kind="active" :value="false" />
          </div>
        </template>
        <template #actions="{ row }">
          <AppButton v-if="can(P.BRANCH_UPDATE)" variant="ghost" size="sm" icon-only :icon="Pencil" :label="$t('common.edit')" @click="open(row)" />
          <AppButton
            v-if="can(P.BRANCH_UPDATE)"
            variant="ghost"
            size="sm"
            icon-only
            :icon="Power"
            :label="row.isActive ? $t('management.branches.deactivate') : $t('management.branches.activate')"
            @click="askToggle(row)"
          />
        </template>
      </DataTable>
    </ListPage>
    <BranchFormModal v-model:open="formOpen" :branch="edited" />
  </div>
</template>

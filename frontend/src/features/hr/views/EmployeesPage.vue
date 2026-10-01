<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
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
import AppAvatar from '@/components/ui/AppAvatar.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { usePermission } from '@/composables/usePermission';
import { fullName } from '@/lib/people';
import type { EmployeeResponseDto } from '@/services/api/schema.gen';
import { useListState } from '@/services/query/useListState';
import { EMPLOYEE_STATUSES, type EmployeeListParams, useDirectoryOptions, useEmployees } from '../api';
import EmployeeFormModal from '../components/EmployeeFormModal.vue';

const { t } = useI18n();
const { can } = usePermission();
const router = useRouter();
const branches = useBranchOptions();
const positions = useDirectoryOptions('positions', () => can(P.POSITIONS_READ));
const departments = useDirectoryOptions('departments', () => can(P.DEPARTMENTS_READ));
const list = useListState({ page: 1, search: '', status: 'ACTIVE', positionId: '', departmentId: '', branchId: '', sortBy: 'lastName', sortOrder: 'asc' });
const employees = useEmployees(() => ({ ...(list.params.value as EmployeeListParams), limit: 20 }));
const creating = ref(false);
const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('hr.name'), sortable: true, sortKey: 'lastName' },
  { key: 'position', label: t('hr.position') },
  { key: 'department', label: t('hr.department'), wide: true },
  { key: 'phone', label: t('common.phone') },
  { key: 'branches', label: t('hr.branches'), wide: true },
  { key: 'status', label: t('common.status') },
]);
const statusOptions = computed(() => EMPLOYEE_STATUSES.map((value) => ({ value, label: t(`status.employee.${value}`) })));
</script>

<template>
  <div>
    <PageHeader :title="$t('hr.title')" :description="$t('hr.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.EMPLOYEES_CREATE)" :icon="Plus" @click="creating = true">{{ $t('hr.new') }}</AppButton>
      </template>
    </PageHeader>
    <ListToolbar :search="list.state.search" :search-label="$t('hr.search')" :active-filters="list.activeFilters.value" @update:search="list.set({ search: $event })" @reset="list.reset()">
      <template #filters>
        <FilterSelect :model-value="list.state.status" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ status: $event })" />
        <FilterSelect v-if="positions.options.value.length" :model-value="list.state.positionId" :label="$t('hr.position')" :options="positions.options.value" @update:model-value="list.set({ positionId: $event })" />
        <FilterSelect v-if="departments.options.value.length" :model-value="list.state.departmentId" :label="$t('hr.department')" :options="departments.options.value" @update:model-value="list.set({ departmentId: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
      </template>
    </ListToolbar>
    <ListPage
      :create-label="can(P.EMPLOYEES_CREATE) && !(list.state.search || list.activeFilters.value > 1) ? $t('hr.new') : undefined"
      :loading="employees.isPending.value"
      :error="employees.error.value"
      :meta="employees.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t('hr.emptyTitle')"
      :empty-text="$t('hr.emptyText')"
      @create="creating = true"
      @update:page="list.set({ page: $event })"
      @retry="employees.refetch()"
    >
      <DataTable
        columns-id="employees"
        :columns="columns"
        :rows="employees.data.value?.items ?? []"
        :row-key="(row: EmployeeResponseDto) => row.id"
        :row-to="(row: EmployeeResponseDto) => ({ name: 'employee', params: { id: row.id } })"
        :caption="$t('hr.title')"
        :loading="employees.isFetching.value"
        :sort="{ sortBy: list.state.sortBy, sortOrder: list.state.sortOrder as 'asc' | 'desc' }"
        @sort="list.set($event)"
      >
        <template #cell-name="{ row }">{{ fullName(row) }}</template>
        <template #cell-position="{ row }">{{ row.position?.name ?? '—' }}</template>
        <template #cell-department="{ row }">{{ row.department?.name ?? '—' }}</template>
        <template #cell-branches="{ row }">{{ row.branches.map((b) => b.branch.name).join(', ') }}</template>
        <template #cell-status="{ row }"><StatusBadge kind="employee" :value="row.status" /></template>
        <template #mobile="{ row }">
          <div class="flex items-center gap-3">
            <AppAvatar :name="fullName(row)" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-fg">{{ fullName(row) }}</p>
              <p class="truncate text-sm text-fg-muted">{{ row.position?.name ?? row.phone }}</p>
            </div>
            <StatusBadge v-if="row.status !== 'ACTIVE'" kind="employee" :value="row.status" />
          </div>
        </template>
      </DataTable>
    </ListPage>
    <EmployeeFormModal v-model:open="creating" @saved="(employee) => router.push({ name: 'employee', params: { id: employee.id } })" />
  </div>
</template>

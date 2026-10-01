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
import type { TeacherResponseDto } from '@/services/api/schema.gen';
import { useListState } from '@/services/query/useListState';
import type { TeacherListParams } from '../api';
import TeacherFormModal from '../components/TeacherFormModal.vue';
import { useTeachers } from '../queries';

const { t } = useI18n();
const { can } = usePermission();
const router = useRouter();
const branches = useBranchOptions();
const list = useListState({ page: 1, search: '', status: 'ACTIVE', branchId: '', sortBy: 'lastName', sortOrder: 'asc' });
const teachers = useTeachers(() => ({ ...(list.params.value as TeacherListParams), limit: 20 }));
const creating = ref(false);

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('teachers.name'), sortable: true, sortKey: 'lastName' },
  { key: 'phone', label: t('common.phone') },
  { key: 'branch', label: t('common.branch') },
  { key: 'account', label: t('teachers.account'), wide: true },
  { key: 'status', label: t('common.status') },
]);
const statusOptions = computed(() => (['ACTIVE', 'INACTIVE'] as const).map((value) => ({ value, label: t(`status.teacher.${value}`) })));
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.teachers')" :description="$t('teachers.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.TEACHERS_CREATE)" :icon="Plus" @click="creating = true">{{ $t('teachers.new') }}</AppButton>
      </template>
    </PageHeader>
    <ListToolbar :search="list.state.search" :search-label="$t('teachers.search')" :active-filters="list.activeFilters.value" @update:search="list.set({ search: $event })" @reset="list.reset()">
      <template #filters>
        <FilterSelect :model-value="list.state.status" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ status: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
      </template>
    </ListToolbar>
    <ListPage
      :create-label="can(P.TEACHERS_CREATE) && !(list.state.search || list.activeFilters.value > 1) ? $t('teachers.new') : undefined"
      :loading="teachers.isPending.value"
      :error="teachers.error.value"
      :meta="teachers.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t('teachers.emptyTitle')"
      :empty-text="$t('teachers.emptyText')"
      @create="creating = true"
      @update:page="list.set({ page: $event })"
      @retry="teachers.refetch()"
    >
      <DataTable
        columns-id="teachers"
        :columns="columns"
        :rows="teachers.data.value?.items ?? []"
        :row-key="(row: TeacherResponseDto) => row.id"
        :row-to="(row: TeacherResponseDto) => ({ name: 'teacher', params: { id: row.id } })"
        :caption="$t('nav.teachers')"
        :loading="teachers.isFetching.value"
        :sort="{ sortBy: list.state.sortBy, sortOrder: list.state.sortOrder as 'asc' | 'desc' }"
        @sort="list.set($event)"
      >
        <template #cell-name="{ row }">{{ fullName(row) }}</template>
        <template #cell-phone="{ row }">{{ row.phone ?? '—' }}</template>
        <template #cell-branch="{ row }">{{ row.branch.name }}</template>
        <template #cell-account="{ row }">
          <span :class="row.userId ? 'text-fg' : 'text-fg-subtle'">{{ row.userId ? $t('teachers.hasAccount') : $t('teachers.noAccount') }}</span>
        </template>
        <template #cell-status="{ row }"><StatusBadge kind="teacher" :value="row.status" /></template>
        <template #mobile="{ row }">
          <div class="flex items-center gap-3">
            <AppAvatar :name="fullName(row)" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-fg">{{ fullName(row) }}</p>
              <p class="truncate text-sm text-fg-muted">{{ row.phone ?? row.branch.name }}</p>
            </div>
            <StatusBadge v-if="row.status !== 'ACTIVE'" kind="teacher" :value="row.status" />
          </div>
        </template>
      </DataTable>
    </ListPage>
    <TeacherFormModal v-model:open="creating" @saved="(teacher) => router.push({ name: 'teacher', params: { id: teacher.id } })" />
  </div>
</template>

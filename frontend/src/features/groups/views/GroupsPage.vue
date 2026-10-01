<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { P } from '@/app/config/permissions';
import CapacityBar from '@/components/data/CapacityBar.vue';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { usePermission } from '@/composables/usePermission';
import { useCourseOptions } from '@/features/courses/queries';
import { fullName } from '@/lib/people';
import type { GroupResponseDto } from '@/services/api/schema.gen';
import { useListState } from '@/services/query/useListState';
import { GROUP_STATUSES, type GroupListParams } from '../api';
import GroupFormModal from '../components/GroupFormModal.vue';
import { useGroups } from '../queries';

const { t } = useI18n();
const { can } = usePermission();
const router = useRouter();
const branches = useBranchOptions();
const courses = useCourseOptions(() => can(P.COURSES_READ));
const list = useListState({ page: 1, search: '', status: 'ACTIVE', courseId: '', branchId: '', sortBy: 'name', sortOrder: 'asc' });
const groups = useGroups(() => ({ ...(list.params.value as GroupListParams), limit: 20 }));
const creating = ref(false);

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('groups.name'), sortable: true },
  { key: 'course', label: t('groups.course') },
  { key: 'teacher', label: t('groups.teacher') },
  { key: 'room', label: t('groups.room'), wide: true },
  { key: 'capacity', label: t('groups.students') },
  { key: 'status', label: t('common.status') },
]);
const statusOptions = computed(() => GROUP_STATUSES.map((value) => ({ value, label: t(`status.group.${value}`) })));
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.groups')" :description="$t('groups.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.GROUPS_CREATE)" :icon="Plus" @click="creating = true">{{ $t('groups.new') }}</AppButton>
      </template>
    </PageHeader>
    <ListToolbar :search="list.state.search" :search-label="$t('groups.search')" :active-filters="list.activeFilters.value" @update:search="list.set({ search: $event })" @reset="list.reset()">
      <template #filters>
        <FilterSelect :model-value="list.state.status" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ status: $event })" />
        <FilterSelect v-if="courses.options.value.length" :model-value="list.state.courseId" :label="$t('groups.course')" :options="courses.options.value" @update:model-value="list.set({ courseId: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
      </template>
    </ListToolbar>
    <ListPage
      :create-label="can(P.GROUPS_CREATE) && !(list.state.search || list.activeFilters.value > 1) ? $t('groups.new') : undefined"
      :loading="groups.isPending.value"
      :error="groups.error.value"
      :meta="groups.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t('groups.emptyTitle')"
      :empty-text="can(P.GROUPS_READ) ? $t('groups.emptyText') : $t('groups.emptyOwn')"
      @create="creating = true"
      @update:page="list.set({ page: $event })"
      @retry="groups.refetch()"
    >
      <DataTable
        columns-id="groups"
        :columns="columns"
        :rows="groups.data.value?.items ?? []"
        :row-key="(row: GroupResponseDto) => row.id"
        :row-to="(row: GroupResponseDto) => ({ name: 'group', params: { id: row.id } })"
        :caption="$t('nav.groups')"
        :loading="groups.isFetching.value"
        :sort="{ sortBy: list.state.sortBy, sortOrder: list.state.sortOrder as 'asc' | 'desc' }"
        @sort="list.set($event)"
      >
        <template #cell-course="{ row }">
          <span class="block">{{ row.course.name }}</span>
          <span v-if="row.level" class="block text-xs text-fg-muted">{{ row.level.name }}</span>
        </template>
        <template #cell-teacher="{ row }">{{ row.teacher ? fullName(row.teacher) : '—' }}</template>
        <template #cell-room="{ row }">{{ row.room?.name ?? '—' }}</template>
        <template #cell-capacity="{ row }"><CapacityBar :used="row.enrolledCount" :total="row.capacity" compact /></template>
        <template #cell-status="{ row }"><StatusBadge kind="group" :value="row.status" /></template>
        <template #mobile="{ row }">
          <div class="flex flex-col gap-2">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-medium text-fg">{{ row.name }}</p>
                <p class="truncate text-sm text-fg-muted">
                  {{ row.course.name }}<template v-if="row.teacher"> · {{ fullName(row.teacher) }}</template>
                </p>
              </div>
              <StatusBadge v-if="row.status !== 'ACTIVE'" kind="group" :value="row.status" />
            </div>
            <CapacityBar :used="row.enrolledCount" :total="row.capacity" />
          </div>
        </template>
      </DataTable>
    </ListPage>
    <GroupFormModal v-model:open="creating" @saved="(group) => router.push({ name: 'group', params: { id: group.id } })" />
  </div>
</template>

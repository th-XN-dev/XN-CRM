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
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useCourseOptions } from '@/features/courses/queries';
import { useGroupOptions } from '@/features/groups/queries';
import { fullName } from '@/lib/people';
import type { StudentListItemDto } from '@/services/api/schema.gen';
import { useListState } from '@/services/query/useListState';
import { STUDENT_STATUSES, type StudentListParams } from '../api';
import StudentFormModal from '../components/StudentFormModal.vue';
import { useStudents } from '../queries';

const { t } = useI18n();
const { can } = usePermission();
const router = useRouter();
const format = useFormatters();
const branches = useBranchOptions();
const list = useListState({
  page: 1,
  search: '',
  status: 'ACTIVE',
  branchId: '',
  groupId: '',
  courseId: '',
  sortBy: 'lastName',
  sortOrder: 'asc',
});
const students = useStudents(() => ({ ...(list.params.value as StudentListParams), limit: 20 }));
const groups = useGroupOptions(() => can([P.GROUPS_READ, P.GROUPS_READ_OWN]));
const courses = useCourseOptions(() => can(P.COURSES_READ));
const creating = ref(false);

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('students.name'), sortable: true, sortKey: 'lastName' },
  { key: 'family', label: t('students.family') },
  { key: 'phone', label: t('common.phone'), wide: true },
  ...(branches.showFilter.value ? [{ key: 'branch', label: t('common.branch'), wide: true }] : []),
  { key: 'joinedAt', label: t('students.joinedAt'), sortable: true, wide: true },
  { key: 'status', label: t('common.status') },
]);
const statusOptions = computed(() => STUDENT_STATUSES.map((value) => ({ value, label: t(`status.student.${value}`) })));
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.students')" :description="$t('students.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.STUDENTS_CREATE)" :icon="Plus" @click="creating = true">{{ $t('students.new') }}</AppButton>
      </template>
    </PageHeader>

    <ListToolbar
      :search="list.state.search"
      :search-label="$t('students.search')"
      :active-filters="list.activeFilters.value"
      @update:search="list.set({ search: $event })"
      @reset="list.reset()"
    >
      <template #filters>
        <FilterSelect :model-value="list.state.status" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ status: $event })" />
        <FilterSelect
          v-if="groups.options.value.length"
          :model-value="list.state.groupId"
          :label="$t('students.group')"
          :options="groups.options.value"
          @update:model-value="list.set({ groupId: $event })"
        />
        <FilterSelect
          v-if="courses.options.value.length"
          :model-value="list.state.courseId"
          :label="$t('students.course')"
          :options="courses.options.value"
          @update:model-value="list.set({ courseId: $event })"
        />
        <FilterSelect
          v-if="branches.showFilter.value"
          :model-value="list.state.branchId"
          :label="$t('common.branch')"
          :options="branches.options.value"
          @update:model-value="list.set({ branchId: $event })"
        />
      </template>
    </ListToolbar>

    <ListPage

      :create-label="can(P.STUDENTS_CREATE) && !(list.state.search || list.activeFilters.value > 1) ? $t('students.new') : undefined"

      :loading="students.isPending.value"
      :error="students.error.value"
      :meta="students.data.value?.meta"
      :page="list.state.page"
      :empty-title="list.state.search || list.activeFilters.value > 1 ? $t('common.noMatches') : $t('students.emptyTitle')"
      :empty-text="$t('students.emptyText')"
      @create="creating = true"
      @update:page="list.set({ page: $event })"
      @retry="students.refetch()"
    >
      <DataTable
        columns-id="students"
        :columns="columns"
        :rows="students.data.value?.items ?? []"
        :row-key="(row: StudentListItemDto) => row.id"
        :row-to="(row: StudentListItemDto) => ({ name: 'student', params: { id: row.id } })"
        :caption="$t('nav.students')"
        :loading="students.isFetching.value"
        :sort="{ sortBy: list.state.sortBy, sortOrder: list.state.sortOrder as 'asc' | 'desc' }"
        @sort="list.set($event)"
      >
        <template #cell-name="{ row }">{{ fullName(row) }}</template>
        <template #cell-family="{ row }">
          <RouterLink :to="{ name: 'family', params: { id: row.familyId } }" class="focus-ring rounded text-fg-muted hover:text-primary-text">
            {{ row.family.name }}
          </RouterLink>
        </template>
        <template #cell-branch="{ row }">{{ row.branch.name }}</template>
        <template #cell-joinedAt="{ row }">{{ format.day(row.joinedAt) }}</template>
        <template #cell-status="{ row }"><StatusBadge kind="student" :value="row.status" /></template>
        <template #mobile="{ row }">
          <div class="flex items-center gap-3">
            <AppAvatar :name="fullName(row)" size="md" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-fg">{{ fullName(row) }}</p>
              <p class="truncate text-sm text-fg-muted">{{ row.family.name }} · {{ row.phone ?? row.family.phone }}</p>
            </div>
            <StatusBadge v-if="row.status !== 'ACTIVE'" kind="student" :value="row.status" />
          </div>
        </template>
      </DataTable>
    </ListPage>

    <StudentFormModal v-model:open="creating" @saved="(student) => router.push({ name: 'student', params: { id: student.id } })" />
  </div>
</template>

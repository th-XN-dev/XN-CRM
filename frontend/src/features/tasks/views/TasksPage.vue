<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { usePermission } from '@/composables/usePermission';
import { useListState } from '@/services/query/useListState';
import { TASK_PRIORITIES, TASK_STATUSES, type TaskListParams, useTasks } from '../api';
import TaskFormModal from '../components/TaskFormModal.vue';
import TaskList from '../components/TaskList.vue';
import { useTaskRights } from '../composables';

/** "My tasks" first; managers switch to the whole team, overdue or done. */
const { t } = useI18n();
const { can } = usePermission();
const rights = useTaskRights();
const list = useListState({ view: 'mine', page: 1, search: '', status: '', priority: '', sortBy: 'dueDate', sortOrder: 'asc' }, ['status', 'priority']);
const views = computed(() => [
  { value: 'mine', label: t('tasks.views.mine') },
  ...(can(P.TASKS_READ) ? [{ value: 'all', label: t('tasks.views.all') }] : []),
  { value: 'overdue', label: t('tasks.views.overdue') },
  { value: 'completed', label: t('tasks.views.completed') },
]);
const params = computed<TaskListParams>(() => {
  const view = list.state.view;
  const base: TaskListParams = {
    page: list.state.page,
    limit: 25,
    search: list.state.search || undefined,
    priority: (list.state.priority || undefined) as TaskListParams['priority'],
    sortBy: list.state.sortBy as TaskListParams['sortBy'],
    sortOrder: list.state.sortOrder as 'asc' | 'desc',
  };
  if (view === 'completed') return { ...base, status: 'COMPLETED', sortBy: 'updatedAt', sortOrder: 'desc', mine: !can(P.TASKS_READ) || undefined };
  if (view === 'overdue') return { ...base, overdue: true, mine: !can(P.TASKS_READ) || undefined };
  if (view === 'all') return { ...base, status: (list.state.status || undefined) as TaskListParams['status'] };
  return { ...base, mine: true, status: (list.state.status || undefined) as TaskListParams['status'] };
});
const tasks = useTasks(params);
const creating = ref(false);
const statusOptions = computed(() => TASK_STATUSES.map((value) => ({ value, label: t(`status.task.${value}`) })));
const priorityOptions = computed(() => TASK_PRIORITIES.map((value) => ({ value, label: t(`status.taskPriority.${value}`) })));
const sortOptions = computed(() => [
  { value: 'dueDate', label: t('tasks.sort.dueDate') },
  { value: 'priority', label: t('tasks.sort.priority') },
  { value: 'createdAt', label: t('tasks.sort.createdAt') },
]);
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.tasks')" :description="$t('tasks.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.TASKS_CREATE)" :icon="Plus" @click="creating = true">{{ $t('tasks.new') }}</AppButton>
      </template>
    </PageHeader>
    <SegmentedControl :model-value="list.state.view" name="task-view" :label="$t('tasks.view')" :options="views" class="mb-4 w-full overflow-x-auto sm:w-auto" @update:model-value="list.set({ view: $event, status: '' })" />
    <ListToolbar :search="list.state.search" :search-label="$t('tasks.search')" :active-filters="list.activeFilters.value" @update:search="list.set({ search: $event })" @reset="list.set({ status: '', priority: '' })">
      <template #filters>
        <FilterSelect v-if="list.state.view === 'mine' || list.state.view === 'all'" :model-value="list.state.status" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ status: $event })" />
        <FilterSelect :model-value="list.state.priority" :label="$t('tasks.priority')" :options="priorityOptions" @update:model-value="list.set({ priority: $event })" />
        <FilterSelect :model-value="list.state.sortBy" :label="$t('tasks.sort.label')" :options="sortOptions" :all-label="$t('tasks.sort.dueDate')" @update:model-value="list.set({ sortBy: $event || 'dueDate', sortOrder: $event === 'createdAt' || $event === 'priority' ? 'desc' : 'asc' })" />
      </template>
    </ListToolbar>
    <ListPage
      :create-label="can(P.TASKS_CREATE) && !(list.state.search || list.activeFilters.value > 0) ? $t('tasks.new') : undefined"
      :loading="tasks.isPending.value"
      :error="tasks.error.value"
      :meta="tasks.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t(`tasks.empty.${list.state.view}`)"
      @create="creating = true"
      @update:page="list.set({ page: $event })"
      @retry="tasks.refetch()"
    >
      <TaskList :tasks="tasks.data.value?.items ?? []" :can-complete="rights.canChangeStatus" :hide-assignee="list.state.view === 'mine'" :class="tasks.isFetching.value && 'opacity-70'" />
    </ListPage>
    <TaskFormModal v-model:open="creating" />
  </div>
</template>

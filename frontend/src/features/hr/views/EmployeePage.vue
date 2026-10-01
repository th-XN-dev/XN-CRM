<script setup lang="ts">
import { Pencil, Phone, Plus, Star, UserX, X } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import DetailHeader from '@/components/data/DetailHeader.vue';
import InfoList, { type InfoItem } from '@/components/data/InfoList.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import AppAvatar from '@/components/ui/AppAvatar.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTabs from '@/components/ui/AppTabs.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useRouteTab } from '@/composables/useRouteTab';
import ActivityTimeline from '@/features/audit/ActivityTimeline.vue';
import { useTasks } from '@/features/tasks/api';
import TaskFormModal from '@/features/tasks/components/TaskFormModal.vue';
import TaskList from '@/features/tasks/components/TaskList.vue';
import { useTaskRights } from '@/features/tasks/composables';
import { fullName, fullNameWithMiddle } from '@/lib/people';
import { useApiMutation, useApiQuery } from '@/services/query/useApiQuery';
import { EMPLOYEE_STATUSES, type EmployeeStatus, HR_KEYS, hrApi, useEmployee } from '../api';
import EmployeeFormModal from '../components/EmployeeFormModal.vue';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const format = useFormatters();
const branches = useBranchOptions();
const rights = useTaskRights();
const employee = useEmployee(() => props.id);
const e = computed(() => employee.data.value);
const name = computed(() => (e.value ? fullName(e.value) : ''));
const tabs = computed(() => [
  { key: 'profile', label: t('hr.tabs.profile') },
  ...(can([P.TASKS_READ, P.TASKS_READ_OWN]) ? [{ key: 'tasks', label: t('hr.tabs.tasks') }] : []),
  ...(can(P.AUDIT_READ) ? [{ key: 'activity', label: t('hr.tabs.activity') }] : []),
]);
const tab = useRouteTab(() => tabs.value.map((x) => x.key), 'profile');
const tasks = useTasks(() => ({ assignedToId: props.id, limit: 50, sortBy: 'dueDate', sortOrder: 'asc' }), () => tab.value === 'tasks');
const stats = useApiQuery({
  key: () => ['tasks', 'employee-stats', props.id],
  fn: () => hrApi.taskStats(props.id),
  enabled: () => tab.value === 'tasks' && can(P.TASKS_STATISTICS_READ),
});
const editing = ref(false);
const addingTask = ref(false);
const newBranch = ref('');
const manageBranches = computed(() => can(P.EMPLOYEE_BRANCHES_MANAGE) && e.value?.status !== 'TERMINATED');
const availableBranches = computed(() => branches.options.value.filter((option) => !e.value?.branches.some((b) => b.branchId === option.value)));

const branchAction = useApiMutation({
  fn: (action: { kind: 'add' | 'primary' | 'remove'; branchId: string }) =>
    action.kind === 'add'
      ? hrApi.addBranch(props.id, action.branchId)
      : action.kind === 'primary'
        ? hrApi.setPrimaryBranch(props.id, action.branchId)
        : hrApi.removeBranch(props.id, action.branchId),
  invalidates: HR_KEYS,
  success: t('hr.branchesSaved'),
  toastError: true,
  onSuccess: () => {
    newBranch.value = '';
  },
});
const setStatus = useApiMutation({
  fn: (status: EmployeeStatus) => (status === 'TERMINATED' ? hrApi.terminate(props.id) : hrApi.updateEmployee(props.id, { status })),
  invalidates: HR_KEYS,
  success: (updated) => t('hr.statusChanged', { status: t(`status.employee.${updated.status}`) }),
  toastError: true,
});
async function changeStatus(status: EmployeeStatus): Promise<void> {
  if (status === 'TERMINATED' && !(await confirm({ title: t('hr.terminateTitle', { name: name.value }), message: t('hr.terminateText'), danger: true, confirmLabel: t('hr.terminate') }))) return;
  setStatus.mutate(status);
}
const statusOptions = computed(() => EMPLOYEE_STATUSES.filter((s) => s !== 'TERMINATED').map((value) => ({ value, label: t(`status.employee.${value}`) })));

const profile = computed<InfoItem[]>(() => {
  const data = e.value;
  if (!data) return [];
  return [
    { key: 'fullName', label: t('students.fullName'), value: fullNameWithMiddle(data) },
    { key: 'position', label: t('hr.position'), value: data.position?.name },
    { key: 'department', label: t('hr.department'), value: data.department?.name },
    { key: 'phone', label: t('common.phone'), value: data.phone },
    { key: 'email', label: t('common.email'), value: data.email },
    { key: 'birthDate', label: t('students.birthDate'), value: data.birthDate ? format.day(data.birthDate) : null },
    { key: 'hireDate', label: t('hr.hireDate'), value: format.day(data.hireDate) },
    ...(data.terminationDate ? [{ key: 'terminationDate', label: t('hr.terminationDate'), value: format.day(data.terminationDate) }] : []),
    { key: 'user', label: t('hr.user'), value: data.user?.name ?? t('teachers.noAccount') },
    { key: 'notes', label: t('common.notes'), value: data.notes },
  ];
});
</script>

<template>
  <QueryState :loading="employee.isPending.value" :error="employee.error.value" loading-variant="page" @retry="employee.refetch()">
    <div v-if="e">
      <DetailHeader :title="name" :subtitle="[e.position?.name, e.department?.name].filter(Boolean).join(' · ')" :back="{ name: 'hr-employees' }" :back-label="$t('hr.title')">
        <template #leading><AppAvatar :name="name" size="lg" class="hidden sm:inline-flex" /></template>
        <template #badges><StatusBadge kind="employee" :value="e.status" /></template>
        <template #actions>
          <AppButton variant="secondary" :icon="Phone" :href="`tel:${e.phone}`">{{ e.phone }}</AppButton>
          <AppButton v-if="can(P.EMPLOYEES_UPDATE) && e.status !== 'TERMINATED'" variant="secondary" :icon="Pencil" @click="editing = true">{{ $t('common.edit') }}</AppButton>
          <AppButton v-if="can(P.EMPLOYEES_DELETE) && e.status !== 'TERMINATED'" variant="ghost" :icon="UserX" @click="changeStatus('TERMINATED')">{{ $t('hr.terminate') }}</AppButton>
        </template>
      </DetailHeader>

      <AppTabs v-if="tabs.length > 1" v-model="tab" :tabs="tabs" :label="name" class="mb-5" />

      <div v-if="tab === 'profile'" class="grid gap-4 lg:grid-cols-3">
        <SectionCard :title="$t('students.profile')" class="lg:col-span-2"><InfoList :items="profile" :columns="2" /></SectionCard>
        <div class="flex flex-col gap-4">
          <SectionCard v-if="can(P.EMPLOYEES_UPDATE) && e.status !== 'TERMINATED'" :title="$t('common.status')">
            <AppSelect :model-value="e.status" :options="statusOptions" :aria-label="$t('common.status')" @update:model-value="changeStatus($event as EmployeeStatus)" />
          </SectionCard>
          <SectionCard :title="$t('hr.branches')" flush>
            <ul>
              <li v-for="item in e.branches" :key="item.id" class="flex items-center gap-2 border-t border-border px-5 py-2.5 first:border-0">
                <span class="min-w-0 flex-1 truncate text-sm text-fg">{{ item.branch.name }}</span>
                <span v-if="item.isPrimary" class="inline-flex items-center gap-1 text-xs font-medium text-primary-text"><Star class="size-3.5 fill-current" aria-hidden="true" />{{ $t('hr.primary') }}</span>
                <template v-else-if="manageBranches">
                  <AppButton variant="ghost" size="sm" icon-only :icon="Star" :label="$t('hr.makePrimary')" @click="branchAction.mutate({ kind: 'primary', branchId: item.branchId })" />
                  <AppButton variant="ghost" size="sm" icon-only :icon="X" :label="$t('common.remove')" @click="branchAction.mutate({ kind: 'remove', branchId: item.branchId })" />
                </template>
              </li>
            </ul>
            <form v-if="manageBranches && availableBranches.length" class="flex gap-2 border-t border-border p-3" @submit.prevent="newBranch && branchAction.mutate({ kind: 'add', branchId: newBranch })">
              <AppSelect v-model="newBranch" :options="availableBranches" :placeholder="$t('hr.addBranch')" :aria-label="$t('hr.addBranch')" class="flex-1" />
              <AppButton type="submit" variant="soft" icon-only :icon="Plus" :label="$t('common.add')" :disabled="!newBranch" />
            </form>
          </SectionCard>
        </div>
      </div>

      <div v-else-if="tab === 'tasks'" class="flex flex-col gap-4">
        <div v-if="stats.data.value" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
v-for="cell in [
            { key: 'open', value: stats.data.value.todo + stats.data.value.inProgress + stats.data.value.blocked },
            { key: 'overdue', value: stats.data.value.overdue },
            { key: 'completed', value: stats.data.value.completed },
            { key: 'rate', value: format.percent(stats.data.value.completionRate) },
          ]" :key="cell.key" class="rounded-2xl border border-border bg-surface p-4">
            <p class="text-xs text-fg-muted">{{ $t(`hr.taskStats.${cell.key}`) }}</p>
            <p class="mt-1 text-xl font-semibold tabular-nums" :class="cell.key === 'overdue' && Number(cell.value) > 0 ? 'text-danger' : 'text-fg'">{{ cell.value }}</p>
          </div>
        </div>
        <SectionCard :title="$t('hr.tabs.tasks')" flush>
          <template #actions>
            <AppButton v-if="can(P.TASKS_CREATE) && e.status === 'ACTIVE'" size="sm" variant="soft" :icon="Plus" @click="addingTask = true">{{ $t('tasks.new') }}</AppButton>
          </template>
          <EmptyState v-if="tasks.data.value?.items.length === 0" compact :text="$t('hr.noTasks')" />
          <TaskList v-else :tasks="tasks.data.value?.items ?? []" :can-complete="rights.canChangeStatus" hide-assignee />
        </SectionCard>
      </div>

      <SectionCard v-else-if="tab === 'activity'" :title="$t('hr.tabs.activity')">
        <ActivityTimeline entity-type="Employee" :entity-id="e.id" />
      </SectionCard>

      <EmployeeFormModal v-model:open="editing" :employee="e" />
      <TaskFormModal v-model:open="addingTask" :assignee="{ id: e.id, name }" />
    </div>
  </QueryState>
</template>

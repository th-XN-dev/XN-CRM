<script setup lang="ts">
import { Ban, CircleCheck, Link2, Pause, Pencil, Play, RotateCcw, Send, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { P } from '@/app/config/permissions';
import DetailHeader from '@/components/data/DetailHeader.vue';
import InfoList, { type InfoItem } from '@/components/data/InfoList.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import EntityPicker from '@/components/forms/EntityPicker.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppTabs from '@/components/ui/AppTabs.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { usePickers } from '@/composables/usePickers';
import { fullName } from '@/lib/people';
import { useApiMutation, useApiQuery } from '@/services/query/useApiQuery';
import { RELATED_ROUTES, TASK_KEYS, tasksApi, type TaskStatus, useTask } from '../api';
import TaskFormModal from '../components/TaskFormModal.vue';
import { useTaskRights } from '../composables';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const router = useRouter();
const format = useFormatters();
const pickers = usePickers();
const rights = useTaskRights();
const task = useTask(() => props.id);
const tk = computed(() => task.data.value);
const comments = useApiQuery({ key: () => ['tasks', 'comments', props.id], fn: () => tasksApi.comments(props.id) });
const history = useApiQuery({ key: () => ['tasks', 'history', props.id], fn: () => tasksApi.history(props.id) });
const tab = ref('comments');
const editing = ref(false);
const comment = ref('');
const closed = computed(() => tk.value?.status === 'COMPLETED' || tk.value?.status === 'CANCELLED');
const canMove = computed(() => !!tk.value && rights.canChangeStatus(tk.value));

const setStatus = useApiMutation({
  fn: (status: TaskStatus) => tasksApi.changeStatus(props.id, status),
  invalidates: TASK_KEYS,
  success: (updated) => t('tasks.statusChanged', { status: t(`status.task.${updated.status}`) }),
  toastError: true,
});
const reassign = useApiMutation({
  fn: (employeeId: string | null) => tasksApi.assign(props.id, employeeId),
  invalidates: TASK_KEYS,
  success: t('tasks.reassigned'),
  toastError: true,
});
const addComment = useApiMutation({
  fn: () => tasksApi.addComment(props.id, comment.value.trim()),
  invalidates: [['tasks']],
  toastError: true,
  onSuccess: () => {
    comment.value = '';
  },
});
const remove = useApiMutation({
  fn: () => tasksApi.remove(props.id),
  invalidates: TASK_KEYS,
  success: t('tasks.deleted'),
  toastError: true,
  onSuccess: async () => {
    await router.push({ name: 'tasks' });
  },
});

async function cancelTask(): Promise<void> {
  if (await confirm({ title: t('tasks.cancelTitle'), confirmLabel: t('tasks.cancelTask'), danger: true })) setStatus.mutate('CANCELLED');
}
async function deleteTask(): Promise<void> {
  if (await confirm({ title: t('tasks.deleteTitle', { title: tk.value?.title ?? '' }), confirmLabel: t('common.delete'), danger: true })) remove.mutate();
}

const details = computed<InfoItem[]>(() => {
  const data = tk.value;
  if (!data) return [];
  return [
    { key: 'assignee', label: t('tasks.assignee'), value: data.assignedTo ? fullName(data.assignedTo) : t('common.unassigned') },
    { key: 'dueDate', label: t('tasks.dueDate'), value: data.dueDate ? format.dateTime(data.dueDate) : null },
    { key: 'priority', label: t('tasks.priority'), value: t(`status.taskPriority.${data.priority}`) },
    { key: 'createdBy', label: t('tasks.createdBy'), value: data.createdBy.name },
    { key: 'createdAt', label: t('common.createdAt'), value: format.dateTime(data.createdAt) },
    { key: 'branch', label: t('common.branch'), value: data.branch.name },
    ...(data.completedAt ? [{ key: 'completedAt', label: t('tasks.completedAt'), value: format.dateTime(data.completedAt) }] : []),
  ];
});
const tabs = computed(() => [
  { key: 'comments', label: t('tasks.comments', { count: comments.data.value?.meta.total ?? 0 }) },
  { key: 'history', label: t('tasks.history') },
]);
</script>

<template>
  <QueryState :loading="task.isPending.value" :error="task.error.value" loading-variant="page" @retry="task.refetch()">
    <div v-if="tk">
      <DetailHeader :title="tk.title" :back="{ name: 'tasks' }" :back-label="$t('nav.tasks')">
        <template #badges>
          <StatusBadge kind="task" :value="tk.status" />
          <StatusBadge kind="taskPriority" :value="tk.priority" />
          <span v-if="tk.isOverdue" class="text-sm font-medium text-danger">{{ $t('tasks.overdue') }}</span>
        </template>
        <template #actions>
          <template v-if="canMove">
            <AppButton v-if="tk.status === 'TODO' || tk.status === 'BLOCKED'" :icon="Play" @click="setStatus.mutate('IN_PROGRESS')">{{ $t('tasks.start') }}</AppButton>
            <AppButton v-if="!closed" :variant="tk.status === 'IN_PROGRESS' ? 'primary' : 'secondary'" :icon="CircleCheck" :loading="setStatus.isPending.value" @click="setStatus.mutate('COMPLETED')">
              {{ $t('tasks.complete') }}
            </AppButton>
            <AppButton v-if="tk.status === 'IN_PROGRESS' || tk.status === 'TODO'" variant="ghost" :icon="Pause" @click="setStatus.mutate('BLOCKED')">{{ $t('tasks.block') }}</AppButton>
            <AppButton v-if="closed" variant="secondary" :icon="RotateCcw" @click="setStatus.mutate('TODO')">{{ $t('tasks.reopen') }}</AppButton>
          </template>
          <AppButton v-if="can(P.TASKS_UPDATE) && !closed" variant="ghost" :icon="Pencil" @click="editing = true">{{ $t('common.edit') }}</AppButton>
          <AppButton v-if="can(P.TASKS_UPDATE) && !closed" variant="ghost" :icon="Ban" @click="cancelTask">{{ $t('tasks.cancelTask') }}</AppButton>
          <AppButton v-if="can(P.TASKS_DELETE)" variant="ghost" icon-only :icon="Trash2" :label="$t('common.delete')" @click="deleteTask" />
        </template>
      </DetailHeader>

      <div class="grid gap-4 lg:grid-cols-3">
        <div class="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <SectionCard :title="$t('common.description')">
            <p v-if="tk.description" class="text-sm whitespace-pre-line text-fg">{{ tk.description }}</p>
            <p v-else class="text-sm text-fg-muted">{{ $t('tasks.noDescription') }}</p>
            <RouterLink
              v-if="tk.relatedType && tk.relatedId"
              :to="{ name: RELATED_ROUTES[tk.relatedType], params: { id: tk.relatedId } }"
              class="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-primary-text hover:underline"
            >
              <Link2 class="size-4" aria-hidden="true" />{{ $t(`tasks.related.${tk.relatedType}`) }}
            </RouterLink>
          </SectionCard>

          <AppTabs v-model="tab" :tabs="tabs" :label="tk.title" />
          <SectionCard v-if="tab === 'comments'">
            <EmptyState v-if="comments.data.value?.items.length === 0" compact :text="$t('tasks.noComments')" />
            <ol v-else class="mb-4 flex flex-col gap-3">
              <li v-for="item in comments.data.value?.items ?? []" :key="item.id" class="rounded-xl bg-surface-muted px-3.5 py-2.5">
                <p class="text-xs text-fg-muted"><strong class="font-medium text-fg">{{ item.user.name }}</strong> · {{ format.relative(item.createdAt) }}</p>
                <p class="mt-1 text-sm whitespace-pre-line text-fg">{{ item.content }}</p>
              </li>
            </ol>
            <form v-if="can(P.TASKS_COMMENT)" class="flex flex-col gap-2" @submit.prevent="comment.trim() && addComment.mutate()">
              <AppTextarea v-model="comment" :rows="2" :placeholder="$t('tasks.commentPlaceholder')" :aria-label="$t('tasks.addComment')" />
              <AppButton type="submit" size="sm" class="self-end" :icon="Send" :disabled="!comment.trim()" :loading="addComment.isPending.value">{{ $t('tasks.addComment') }}</AppButton>
            </form>
          </SectionCard>
          <SectionCard v-else>
            <ol class="flex flex-col">
              <li v-for="item in history.data.value?.items ?? []" :key="item.id" class="flex gap-3 border-b border-border py-2.5 last:border-0">
                <span class="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <div class="min-w-0">
                  <p class="text-sm text-fg">
                    <strong class="font-medium">{{ item.user.name }}</strong> {{ $t(`tasks.activity.${item.type}`) }}
                    <template v-if="item.type === 'STATUS_CHANGED' && item.newValue">: {{ $te(`status.task.${item.newValue}`) ? $t(`status.task.${item.newValue}`) : item.newValue }}</template>
                  </p>
                  <p v-if="item.note" class="text-sm text-fg-muted">{{ item.note }}</p>
                  <p class="text-xs text-fg-subtle">{{ format.dateTime(item.createdAt) }}</p>
                </div>
              </li>
            </ol>
          </SectionCard>
        </div>

        <SectionCard :title="$t('common.details')">
          <InfoList :items="details">
            <template v-if="tk.isOverdue" #item-dueDate>
              <span class="font-medium text-danger">{{ format.dateTime(tk.dueDate ?? '') }}</span>
            </template>
          </InfoList>
          <div v-if="can(P.TASKS_ASSIGN) && !closed" class="mt-4 border-t border-border pt-4">
            <p class="mb-1.5 text-xs font-medium text-fg-muted">{{ $t('tasks.reassign') }}</p>
            <EntityPicker
              :model-value="tk.assignedToId ?? ''"
              :search="pickers.employees()"
              :initial-label="tk.assignedTo ? fullName(tk.assignedTo) : undefined"
              :placeholder="$t('tasks.assigneeSearch')"
              :aria-label="$t('tasks.reassign')"
              @select="reassign.mutate($event?.value ?? null)"
            />
          </div>
        </SectionCard>
      </div>
      <TaskFormModal v-model:open="editing" :task="tk" />
    </div>
  </QueryState>
</template>

<script setup lang="ts">
import { Circle, CircleCheck, CalendarClock } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import StatusBadge from '@/components/data/StatusBadge.vue';
import { useFormatters } from '@/composables/useFormatters';
import { fullName } from '@/lib/people';
import type { TaskResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { TASK_KEYS, tasksApi } from '../api';

/**
 * Tasks as a to-do list: tick to complete (the server confirms, then the list
 * refreshes), title opens the task, overdue deadlines in red.
 */
defineProps<{ tasks: readonly TaskResponseDto[]; canComplete?: (task: TaskResponseDto) => boolean; hideAssignee?: boolean }>();
const { t } = useI18n();
const format = useFormatters();
const complete = useApiMutation({
  fn: (task: TaskResponseDto) => tasksApi.changeStatus(task.id, task.status === 'COMPLETED' ? 'TODO' : 'COMPLETED'),
  invalidates: TASK_KEYS,
  success: (task) => (task.status === 'COMPLETED' ? t('tasks.completedToast') : t('tasks.reopenedToast')),
  toastError: true,
});
const closed = (task: TaskResponseDto) => task.status === 'COMPLETED' || task.status === 'CANCELLED';
</script>

<template>
  <ul>
    <li v-for="task in tasks" :key="task.id" class="flex items-start gap-3 border-t border-border px-4 py-3 first:border-0 sm:px-5">
      <button
        v-if="canComplete?.(task) && task.status !== 'CANCELLED'"
        type="button"
        class="focus-ring -m-1 mt-0 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-fg-subtle hover:text-success disabled:opacity-50"
        :aria-label="task.status === 'COMPLETED' ? $t('tasks.reopen') : $t('tasks.complete')"
        :aria-pressed="task.status === 'COMPLETED'"
        :disabled="complete.isPending.value"
        @click="complete.mutate(task)"
      >
        <CircleCheck v-if="task.status === 'COMPLETED'" class="size-5 text-success" aria-hidden="true" />
        <Circle v-else class="size-5" aria-hidden="true" />
      </button>
      <span v-else class="w-6 shrink-0" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <RouterLink :to="{ name: 'task', params: { id: task.id } }" class="focus-ring block rounded font-medium hover:text-primary-text" :class="closed(task) ? 'text-fg-muted line-through' : 'text-fg'">
          {{ task.title }}
        </RouterLink>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
          <span v-if="task.dueDate" class="inline-flex items-center gap-1" :class="task.isOverdue && 'font-medium text-danger'">
            <CalendarClock class="size-3.5" aria-hidden="true" />{{ format.dateTime(task.dueDate) }}
          </span>
          <span v-if="!hideAssignee">{{ task.assignedTo ? fullName(task.assignedTo) : $t('common.unassigned') }}</span>
        </p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge v-if="task.status !== 'TODO' && task.status !== 'COMPLETED'" kind="task" :value="task.status" />
        <StatusBadge v-if="task.priority === 'HIGH' || task.priority === 'URGENT'" kind="taskPriority" :value="task.priority" />
      </div>
    </li>
  </ul>
</template>

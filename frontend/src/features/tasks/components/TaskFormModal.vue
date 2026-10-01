<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import EntityPicker from '@/components/forms/EntityPicker.vue';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePermission } from '@/composables/usePermission';
import { usePickers } from '@/composables/usePickers';
import { fromLocalInput, toLocalInput } from '@/lib/dates';
import { fullName } from '@/lib/people';
import { zOptionalId, zOptionalText, zText } from '@/lib/validation';
import type { TaskResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { type RelatedType, TASK_KEYS, TASK_PRIORITIES, type TaskPriority, tasksApi } from '../api';

/** A task: what, who, by when, how urgent — optionally about a student/lead/family/group/employee. */
const props = defineProps<{
  task?: TaskResponseDto | null;
  related?: { type: RelatedType; id: string; label: string } | null;
  /** Preselected assignee (from an employee page). */
  assignee?: { id: string; name: string } | null;
}>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [task: TaskResponseDto] }>();
const { t } = useI18n();
const { can } = usePermission();
const pickers = usePickers();
const branches = useBranchOptions();
const editing = computed(() => !!props.task);
const priorityOptions = computed(() => TASK_PRIORITIES.map((value) => ({ value, label: t(`status.taskPriority.${value}`) })));

const schema = z.object({
  title: zText(200, 2),
  description: zOptionalText(5000),
  priority: z.enum(TASK_PRIORITIES as [TaskPriority, ...TaskPriority[]]),
  dueDate: z.string().default(''),
  assignedToId: zOptionalId(),
  branchId: zOptionalId(),
});
const save = useApiMutation({
  fn: ({ dueDate, assignedToId, branchId, ...values }: z.output<typeof schema>) =>
    props.task
      ? tasksApi.update(props.task.id, { ...values, description: values.description ?? null, dueDate: fromLocalInput(dueDate) ?? null })
      : tasksApi.create({
          ...values,
          dueDate: fromLocalInput(dueDate),
          assignedToId,
          branchId,
          relatedType: props.related?.type,
          relatedId: props.related?.id,
        }),
  invalidates: TASK_KEYS,
  success: () => (editing.value ? t('tasks.saved') : t('tasks.created')),
  onSuccess: (task) => {
    open.value = false;
    emit('saved', task);
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    title: props.task?.title ?? '',
    description: props.task?.description ?? '',
    priority: (props.task?.priority ?? 'MEDIUM') as TaskPriority,
    dueDate: toLocalInput(props.task?.dueDate),
    assignedToId: props.task?.assignedToId ?? props.assignee?.id ?? '',
    branchId: props.task?.branchId ?? branches.defaultId.value,
  }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: { EMPLOYEE_NOT_ASSIGNABLE: 'assignedToId', TASK_ASSIGNEE_NO_BRANCH_ACCESS: 'assignedToId' },
});
const [title] = defineField('title');
const [description] = defineField('description');
const [priority] = defineField('priority');
const [dueDate] = defineField('dueDate');
const [assignedToId] = defineField('assignedToId');
const [branchId] = defineField('branchId');
const assigneeLabel = computed(() => props.assignee?.name ?? (props.task?.assignedTo ? fullName(props.task.assignedTo) : undefined));
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('tasks.edit') : $t('tasks.new')" :description="related?.label" :loading="isSubmitting" :error="formError" @submit="onSubmit">
    <FormField v-slot="field" :label="$t('tasks.titleLabel')" :error="errors.title">
      <AppInput :id="field.id" v-model="title" :placeholder="$t('tasks.titlePlaceholder')" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('common.description')" optional :error="errors.description">
      <AppTextarea :id="field.id" v-model="description" :rows="3" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-if="!editing && can([P.TASKS_ASSIGN, P.EMPLOYEES_READ])" v-slot="field" :label="$t('tasks.assignee')" optional :error="errors.assignedToId">
        <EntityPicker
          :id="field.id"
          v-model="assignedToId"
          :search="pickers.employees()"
          :initial-label="assigneeLabel"
          :placeholder="$t('tasks.assigneeSearch')"
          :invalid="field.invalid"
          :described-by="field.describedBy"
        />
      </FormField>
      <FormField v-slot="field" :label="$t('tasks.priority')" :error="errors.priority">
        <AppSelect :id="field.id" :model-value="priority" :options="priorityOptions" :invalid="field.invalid" :described-by="field.describedBy" @update:model-value="priority = $event as TaskPriority" />
      </FormField>
      <FormField v-slot="field" :label="$t('tasks.dueDate')" optional :error="errors.dueDate">
        <AppInput :id="field.id" v-model="dueDate" type="datetime-local" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-if="!editing && branches.options.value.length > 1" v-slot="field" :label="$t('common.branch')" :error="errors.branchId">
        <AppSelect :id="field.id" v-model="branchId" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
  </FormModal>
</template>

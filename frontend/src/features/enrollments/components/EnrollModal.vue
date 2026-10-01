<script setup lang="ts">
import { Users } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import EntityPicker, { type PickerOption } from '@/components/forms/EntityPicker.vue';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePickers } from '@/composables/usePickers';
import { orgDay } from '@/lib/dates';
import { zDate, zId, zOptionalText } from '@/lib/validation';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { ENROLLMENT_KEYS, enrollmentsApi } from '../api';

/**
 * Student → group. One of the two is usually fixed by the page it is opened
 * from; the group list shows free seats and disables full groups, the server
 * re-checks capacity on submit.
 */
const props = defineProps<{
  student?: { id: string; name: string } | null;
  group?: { id: string; name: string; seatsLeft: number } | null;
}>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const session = useSessionStore();
const pickers = usePickers();
const chosenGroup = ref<PickerOption | null>(null);

const schema = z.object({
  studentId: zId(),
  groupId: zId(),
  startedAt: zDate(),
  notes: zOptionalText(1000),
});

const enroll = useApiMutation({
  fn: (values: z.output<typeof schema>) => enrollmentsApi.create(values),
  invalidates: ENROLLMENT_KEYS,
  success: (enrollment) => t('enrollments.enrolled', { group: enrollment.group.name }),
  onSuccess: () => {
    open.value = false;
  },
});

const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    studentId: props.student?.id ?? '',
    groupId: props.group?.id ?? '',
    startedAt: orgDay(session.organization?.timezone),
    notes: '',
  }),
  submit: (values) => enroll.mutateAsync(values),
  fieldCodes: {
    GROUP_CAPACITY_FULL: 'groupId',
    GROUP_NOT_ACTIVE: 'groupId',
    STUDENT_ALREADY_ENROLLED: 'groupId',
    STUDENT_HAS_ACTIVE_ENROLLMENT: 'studentId',
    STUDENT_NOT_ACTIVE: 'studentId',
  },
});
const [studentId] = defineField('studentId');
const [groupId] = defineField('groupId');
const [startedAt] = defineField('startedAt');
const [notes] = defineField('notes');

const seatsNote = computed(() => {
  if (props.group) return t('groups.seatsLeft', { count: props.group.seatsLeft }, props.group.seatsLeft);
  return chosenGroup.value?.description;
});

watch(open, (value) => {
  if (!value) return;
  chosenGroup.value = null;
  reset();
});
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="$t('enrollments.enrollTitle')"
    :description="student ? $t('enrollments.enrollFor', { name: student.name }) : group ? $t('enrollments.enrollInto', { group: group.name }) : undefined"
    :submit-label="$t('enrollments.enroll')"
    :loading="isSubmitting"
    :error="formError"
    @submit="onSubmit"
  >
    <FormField v-if="!student" v-slot="field" :label="$t('enrollments.student')" :error="errors.studentId">
      <EntityPicker
        :id="field.id"
        v-model="studentId"
        :search="pickers.students({ status: 'ACTIVE' })"
        :placeholder="$t('enrollments.studentSearch')"
        :invalid="field.invalid"
        :described-by="field.describedBy"
      />
    </FormField>
    <FormField v-if="!group" v-slot="field" :label="$t('enrollments.group')" :error="errors.groupId">
      <EntityPicker
        :id="field.id"
        v-model="groupId"
        :search="pickers.groups()"
        :placeholder="$t('enrollments.groupSearch')"
        :invalid="field.invalid"
        :described-by="field.describedBy"
        @select="chosenGroup = $event"
      />
    </FormField>
    <p v-if="seatsNote" class="-mt-1 flex items-center gap-2 text-sm text-fg-muted">
      <Users class="size-4" aria-hidden="true" />{{ seatsNote }}
    </p>
    <FormField v-slot="field" :label="$t('enrollments.startDate')" :error="errors.startedAt">
      <AppDatePicker :id="field.id" v-model="startedAt" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('common.note')" optional :error="errors.notes">
      <AppTextarea :id="field.id" v-model="notes" :rows="2" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

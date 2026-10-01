<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { orgDay } from '@/lib/dates';
import { zDate, zOptionalText } from '@/lib/validation';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { ENROLLMENT_KEYS, enrollmentsApi } from '../api';

/** A student leaves a group (the enrollment is closed, history stays). */
const props = defineProps<{ enrollment: { id: string; studentName: string; groupName: string } | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const session = useSessionStore();

const schema = z.object({ endedAt: zDate(), notes: zOptionalText(1000) });
const leave = useApiMutation({
  fn: (values: z.output<typeof schema>) => enrollmentsApi.cancel(props.enrollment?.id ?? '', values),
  invalidates: ENROLLMENT_KEYS,
  success: t('enrollments.left'),
  onSuccess: () => {
    open.value = false;
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({ endedAt: orgDay(session.organization?.timezone), notes: '' }),
  submit: (values) => leave.mutateAsync(values),
});
const [endedAt] = defineField('endedAt');
const [notes] = defineField('notes');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="$t('enrollments.leaveTitle')"
    :description="enrollment ? $t('enrollments.leaveText', { name: enrollment.studentName, group: enrollment.groupName }) : undefined"
    :submit-label="$t('enrollments.leave')"
    :loading="isSubmitting"
    :error="formError"
    danger
    size="sm"
    @submit="onSubmit"
  >
    <FormField v-slot="field" :label="$t('enrollments.endDate')" :error="errors.endedAt">
      <AppDatePicker :id="field.id" v-model="endedAt" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('enrollments.reason')" optional :error="errors.notes">
      <AppTextarea :id="field.id" v-model="notes" :rows="2" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

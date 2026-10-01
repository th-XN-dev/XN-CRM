<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import FormModal from '@/components/forms/FormModal.vue';
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { useApiMutation } from '@/services/query/useApiQuery';
import { STUDENT_STATUSES, studentsApi, type StudentStatus } from '../api';

/**
 * Freeze, graduate, mark as left or re-activate. Nothing is deleted: history,
 * attendance and payments stay; the student simply stops counting as active.
 */
const props = defineProps<{ student: { id: string; name: string; status: StudentStatus } | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const chosen = ref<StudentStatus>('ACTIVE');
const error = ref<string | null>(null);
const options = computed(() => STUDENT_STATUSES.filter((status) => status !== props.student?.status));

const change = useApiMutation({
  fn: (status: StudentStatus) =>
    status === 'LEFT' ? studentsApi.markLeft(props.student?.id ?? '') : studentsApi.update(props.student?.id ?? '', { status }),
  invalidates: [['students'], ['families'], ['groups'], ['enrollments'], ['dashboard']],
  success: (student) => t('students.statusChanged', { status: t(`status.student.${student.status}`) }),
  onSuccess: () => {
    open.value = false;
  },
});

async function submit(): Promise<void> {
  error.value = null;
  try {
    await change.mutateAsync(chosen.value);
  } catch (failure) {
    error.value = apiErrorMessage(failure);
  }
}

watch(open, (value) => {
  if (!value) return;
  error.value = null;
  chosen.value = options.value[0] ?? 'ACTIVE';
});
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="$t('students.changeStatus')"
    :description="student?.name"
    :submit-label="$t('students.applyStatus')"
    :loading="change.isPending.value"
    :error="error"
    :danger="chosen === 'LEFT'"
    size="sm"
    @submit="submit"
  >
    <AppRadioGroup
      v-model="chosen"
      name="student-status"
      :label="$t('common.status')"
      :options="options.map((value) => ({ value, label: $t(`status.student.${value}`), description: $t(`students.statusHint.${value}`) }))"
    />
  </FormModal>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useEntityForm } from '@/composables/useEntityForm';
import { useMembers } from '@/features/organizations/queries';
import { zOptionalId, zOptionalPhone, zOptionalText, zText } from '@/lib/validation';
import type { TeacherResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { teachersApi } from '../api';

/**
 * A teacher. Linking a CRM user lets them sign in and see only their own
 * groups, students and attendance.
 */
const props = defineProps<{ teacher?: TeacherResponseDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [teacher: TeacherResponseDto] }>();
const { t } = useI18n();
const branches = useBranchOptions();
const members = useMembers();
const editing = computed(() => !!props.teacher);

const schema = z.object({
  lastName: zText(80),
  firstName: zText(80),
  phone: zOptionalPhone(),
  branchId: zOptionalId(),
  userId: z.string().default(''),
  notes: zOptionalText(1000),
});
const save = useApiMutation({
  fn: (values: z.output<typeof schema>) => {
    const body = { ...values, userId: values.userId || undefined };
    if (!props.teacher) return teachersApi.create(body);
    // Unlinking sends null explicitly.
    return teachersApi.update(props.teacher.id, { ...body, userId: values.userId || null });
  },
  invalidates: [['teachers'], ['groups'], ['schedules']],
  success: () => (editing.value ? t('teachers.saved') : t('teachers.created')),
  onSuccess: (teacher) => {
    open.value = false;
    emit('saved', teacher);
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    lastName: props.teacher?.lastName ?? '',
    firstName: props.teacher?.firstName ?? '',
    phone: props.teacher?.phone ?? '',
    branchId: props.teacher?.branchId ?? branches.defaultId.value,
    userId: props.teacher?.userId ?? '',
    notes: props.teacher?.notes ?? '',
  }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: { TEACHER_USER_TAKEN: 'userId', TEACHER_USER_NOT_MEMBER: 'userId' },
});
const [lastName] = defineField('lastName');
const [firstName] = defineField('firstName');
const [phone] = defineField('phone');
const [branchId] = defineField('branchId');
const [userId] = defineField('userId');
const [notes] = defineField('notes');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('teachers.edit') : $t('teachers.new')" :loading="isSubmitting" :error="formError" @submit="onSubmit">
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('students.lastName')" :error="errors.lastName">
        <AppInput :id="field.id" v-model="lastName" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('students.firstName')" :error="errors.firstName">
        <AppInput :id="field.id" v-model="firstName" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('common.phone')" optional :error="errors.phone">
        <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-if="branches.options.value.length > 1" v-slot="field" :label="$t('common.branch')" :error="errors.branchId">
        <AppSelect :id="field.id" v-model="branchId" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-if="members.options.value.length" v-slot="field" :label="$t('teachers.user')" :hint="$t('teachers.userHint')" optional :error="errors.userId">
      <AppSelect :id="field.id" v-model="userId" :options="[{ value: '', label: $t('teachers.noUser') }, ...members.options.value]" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('common.notes')" optional :error="errors.notes">
      <AppTextarea :id="field.id" v-model="notes" :rows="2" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

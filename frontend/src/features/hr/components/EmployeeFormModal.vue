<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePermission } from '@/composables/usePermission';
import { useMembers } from '@/features/organizations/queries';
import { orgDay } from '@/lib/dates';
import { zDate, zOptionalDate, zOptionalEmail, zOptionalId, zOptionalText, zPhone, zText } from '@/lib/validation';
import type { EmployeeResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { HR_KEYS, hrApi, useDirectoryOptions } from '../api';

/** A staff member: who, which position/department, main branch, and (optionally) their CRM login. */
const props = defineProps<{ employee?: EmployeeResponseDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [employee: EmployeeResponseDto] }>();
const { t } = useI18n();
const { can } = usePermission();
const session = useSessionStore();
const branches = useBranchOptions();
const members = useMembers();
const positions = useDirectoryOptions('positions', () => open.value && can(P.POSITIONS_READ));
const departments = useDirectoryOptions('departments', () => open.value && can(P.DEPARTMENTS_READ));
const editing = computed(() => !!props.employee);

const schema = z.object({
  lastName: zText(80),
  firstName: zText(80),
  middleName: zOptionalText(80),
  phone: zPhone(),
  email: zOptionalEmail(),
  birthDate: zOptionalDate(),
  hireDate: zDate(),
  positionId: zOptionalId(),
  departmentId: zOptionalId(),
  primaryBranchId: zOptionalId(),
  userId: z.string().default(''),
  notes: zOptionalText(2000),
});
const save = useApiMutation({
  fn: ({ primaryBranchId, userId, ...values }: z.output<typeof schema>) =>
    props.employee
      ? hrApi.updateEmployee(props.employee.id, { ...values, userId: userId || null })
      : hrApi.createEmployee({ ...values, primaryBranchId, userId: userId || undefined }),
  invalidates: HR_KEYS,
  success: () => (editing.value ? t('hr.saved') : t('hr.created')),
  onSuccess: (employee) => {
    open.value = false;
    emit('saved', employee);
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    lastName: props.employee?.lastName ?? '',
    firstName: props.employee?.firstName ?? '',
    middleName: props.employee?.middleName ?? '',
    phone: props.employee?.phone ?? '',
    email: props.employee?.email ?? '',
    birthDate: props.employee?.birthDate?.slice(0, 10) ?? '',
    hireDate: props.employee?.hireDate.slice(0, 10) ?? orgDay(session.organization?.timezone),
    positionId: props.employee?.positionId ?? '',
    departmentId: props.employee?.departmentId ?? '',
    primaryBranchId: props.employee?.primaryBranchId ?? branches.defaultId.value,
    userId: props.employee?.userId ?? '',
    notes: props.employee?.notes ?? '',
  }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: {
    EMPLOYEE_USER_TAKEN: 'userId',
    EMPLOYEE_USER_NOT_MEMBER: 'userId',
    POSITION_INACTIVE: 'positionId',
    DEPARTMENT_INACTIVE: 'departmentId',
  },
});
const [lastName] = defineField('lastName');
const [firstName] = defineField('firstName');
const [middleName] = defineField('middleName');
const [phone] = defineField('phone');
const [email] = defineField('email');
const [birthDate] = defineField('birthDate');
const [hireDate] = defineField('hireDate');
const [positionId] = defineField('positionId');
const [departmentId] = defineField('departmentId');
const [primaryBranchId] = defineField('primaryBranchId');
const [userId] = defineField('userId');
const [notes] = defineField('notes');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('hr.edit') : $t('hr.new')" :loading="isSubmitting" :error="formError" size="lg" @submit="onSubmit">
    <div class="grid gap-4 sm:grid-cols-3">
      <FormField v-slot="field" :label="$t('students.lastName')" :error="errors.lastName">
        <AppInput :id="field.id" v-model="lastName" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('students.firstName')" :error="errors.firstName">
        <AppInput :id="field.id" v-model="firstName" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('students.middleName')" optional :error="errors.middleName">
        <AppInput :id="field.id" v-model="middleName" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('common.phone')" :error="errors.phone">
        <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('common.email')" optional :error="errors.email">
        <AppInput :id="field.id" v-model="email" type="email" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-if="positions.options.value.length" v-slot="field" :label="$t('hr.position')" optional :error="errors.positionId">
        <AppSelect :id="field.id" v-model="positionId" :options="[{ value: '', label: '—' }, ...positions.options.value]" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-if="departments.options.value.length" v-slot="field" :label="$t('hr.department')" optional :error="errors.departmentId">
        <AppSelect :id="field.id" v-model="departmentId" :options="[{ value: '', label: '—' }, ...departments.options.value]" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('hr.hireDate')" :error="errors.hireDate">
        <AppDatePicker :id="field.id" v-model="hireDate" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('students.birthDate')" optional :error="errors.birthDate">
        <AppDatePicker :id="field.id" v-model="birthDate" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-if="!editing && branches.options.value.length > 1" v-slot="field" :label="$t('hr.primaryBranch')" :error="errors.primaryBranchId">
        <AppSelect :id="field.id" v-model="primaryBranchId" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-if="members.options.value.length" v-slot="field" :label="$t('hr.user')" :hint="$t('hr.userHint')" optional :error="errors.userId">
        <AppSelect :id="field.id" v-model="userId" :options="[{ value: '', label: $t('teachers.noUser') }, ...members.options.value]" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-slot="field" :label="$t('common.notes')" optional :error="errors.notes">
      <AppTextarea :id="field.id" v-model="notes" :rows="2" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

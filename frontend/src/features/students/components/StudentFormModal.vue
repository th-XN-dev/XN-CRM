<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import EntityPicker from '@/components/forms/EntityPicker.vue';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePickers } from '@/composables/usePickers';
import { orgDay } from '@/lib/dates';
import { zOptionalDate, zOptionalPhone, zOptionalText, zPhone, zText } from '@/lib/validation';
import type { StudentDetailDto, StudentResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { studentsApi } from '../api';

/**
 * New student: into an existing family or a new one (one step, no detour).
 * Edit: profile fields only — status and group have their own actions.
 */
const props = defineProps<{
  student?: StudentDetailDto | null;
  /** Fixed family (adding a child from the family page). */
  family?: { id: string; name: string } | null;
}>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [student: StudentResponseDto] }>();
const { t } = useI18n();
const session = useSessionStore();
const branches = useBranchOptions();
const pickers = usePickers();
const editing = computed(() => !!props.student);
const familyMode = ref<'existing' | 'new'>('existing');

const genderOptions = computed(() => [
  { value: '', label: t('students.genderUnset') },
  { value: 'MALE', label: t('students.male') },
  { value: 'FEMALE', label: t('students.female') },
]);

const schema = z
  .object({
    familyId: z.string().default(''),
    familyName: z.string().trim().default(''),
    familyPhone: z.string().trim().default(''),
    lastName: zText(80),
    firstName: zText(80),
    middleName: zOptionalText(80),
    gender: z.string().optional().transform((value) => (value === 'MALE' || value === 'FEMALE' ? value : undefined)),
    birthDate: zOptionalDate(),
    phone: zOptionalPhone(),
    branchId: z.string().default(''),
    joinedAt: zOptionalDate(),
    notes: zOptionalText(2000),
  })
  .superRefine((values, context) => {
    if (editing.value || props.family) return;
    if (familyMode.value === 'existing' && !values.familyId) {
      context.addIssue({ code: 'custom', path: ['familyId'], message: t('students.chooseFamily') });
    }
    if (familyMode.value === 'new') {
      if (values.familyName.length < 2) context.addIssue({ code: 'custom', path: ['familyName'], message: t('validation.required') });
      if (!zPhone().safeParse(values.familyPhone).success) {
        context.addIssue({ code: 'custom', path: ['familyPhone'], message: t('validation.phone') });
      }
    }
  });

const save = useApiMutation({
  fn: (values: z.output<typeof schema>) => {
    const profile = {
      firstName: values.firstName,
      lastName: values.lastName,
      middleName: values.middleName,
      gender: values.gender,
      birthDate: values.birthDate,
      phone: values.phone,
      notes: values.notes,
    };
    if (props.student) return studentsApi.update(props.student.id, profile);
    const branchId = values.branchId || undefined;
    const family =
      props.family || familyMode.value === 'existing'
        ? { familyId: props.family?.id ?? values.familyId }
        : {
            family: {
              name: values.familyName,
              phone: zPhone().parse(values.familyPhone),
              primaryBranchId: branchId,
            },
          };
    return studentsApi.create({ ...profile, ...family, branchId, joinedAt: values.joinedAt });
  },
  invalidates: [['students'], ['families'], ['dashboard']],
  success: () => (editing.value ? t('students.saved') : t('students.created')),
  onSuccess: (student) => {
    open.value = false;
    emit('saved', student);
  },
});

const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    familyId: '',
    familyName: '',
    familyPhone: '',
    lastName: props.student?.lastName ?? '',
    firstName: props.student?.firstName ?? '',
    middleName: props.student?.middleName ?? '',
    gender: props.student?.gender ?? '',
    birthDate: props.student?.birthDate?.slice(0, 10) ?? '',
    phone: props.student?.phone ?? '',
    branchId: branches.defaultId.value,
    joinedAt: orgDay(session.organization?.timezone),
    notes: props.student?.notes ?? '',
  }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: { FAMILY_INACTIVE: 'familyId', FAMILY_NOT_FOUND: 'familyId' },
});
const [familyId] = defineField('familyId');
const [familyName] = defineField('familyName');
const [familyPhone] = defineField('familyPhone');
const [lastName] = defineField('lastName');
const [firstName] = defineField('firstName');
const [middleName] = defineField('middleName');
const [gender] = defineField('gender');
const [birthDate] = defineField('birthDate');
const [phone] = defineField('phone');
const [branchId] = defineField('branchId');
const [joinedAt] = defineField('joinedAt');
const [notes] = defineField('notes');

watch(open, (value) => {
  if (!value) return;
  familyMode.value = 'existing';
  reset();
});
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="editing ? $t('students.edit') : $t('students.new')"
    :loading="isSubmitting"
    :error="formError"
    size="lg"
    @submit="onSubmit"
  >
    <fieldset v-if="!editing" class="flex flex-col gap-3 rounded-2xl bg-surface-muted/60 p-4">
      <legend class="sr-only">{{ $t('students.family') }}</legend>
      <p v-if="family" class="text-sm text-fg">
        <span class="text-fg-muted">{{ $t('students.family') }}:</span> <strong>{{ family.name }}</strong>
      </p>
      <template v-else>
        <SegmentedControl
          v-model="familyMode"
          name="family-mode"
          :label="$t('students.family')"
          :options="[
            { value: 'existing', label: $t('students.existingFamily') },
            { value: 'new', label: $t('students.newFamily') },
          ]"
        />
        <FormField v-if="familyMode === 'existing'" v-slot="field" :label="$t('students.family')" :error="errors.familyId">
          <EntityPicker
            :id="field.id"
            v-model="familyId"
            :search="pickers.families"
            :placeholder="$t('students.familySearch')"
            :invalid="field.invalid"
            :described-by="field.describedBy"
          />
        </FormField>
        <div v-else class="grid gap-4 sm:grid-cols-2">
          <FormField v-slot="field" :label="$t('families.name')" :hint="$t('families.nameHint')" :error="errors.familyName">
            <AppInput :id="field.id" v-model="familyName" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <FormField v-slot="field" :label="$t('students.parentPhone')" :error="errors.familyPhone">
            <AppInput :id="field.id" v-model="familyPhone" type="tel" inputmode="tel" placeholder="+998 90 123 45 67" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
        </div>
      </template>
    </fieldset>

    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('students.lastName')" :error="errors.lastName">
        <AppInput :id="field.id" v-model="lastName" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('students.firstName')" :error="errors.firstName">
        <AppInput :id="field.id" v-model="firstName" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('students.middleName')" optional :error="errors.middleName">
        <AppInput :id="field.id" v-model="middleName" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('students.gender')" optional :error="errors.gender">
        <AppSelect :id="field.id" v-model="gender" :options="genderOptions" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('students.birthDate')" optional :error="errors.birthDate">
        <AppDatePicker :id="field.id" v-model="birthDate" :max="orgDay(session.organization?.timezone)" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('students.phone')" optional :error="errors.phone">
        <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <template v-if="!editing">
        <FormField v-if="branches.options.value.length > 1" v-slot="field" :label="$t('common.branch')" :error="errors.branchId">
          <AppSelect :id="field.id" v-model="branchId" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-slot="field" :label="$t('students.joinedAt')" :error="errors.joinedAt">
          <AppDatePicker :id="field.id" v-model="joinedAt" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
      </template>
    </div>
    <FormField v-slot="field" :label="$t('common.notes')" optional :error="errors.notes">
      <AppTextarea :id="field.id" v-model="notes" :rows="3" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

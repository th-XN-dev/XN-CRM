<script setup lang="ts">
import { CircleCheck, GraduationCap, House, UsersRound } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import EntityPicker from '@/components/forms/EntityPicker.vue';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppModal from '@/components/ui/AppModal.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePermission } from '@/composables/usePermission';
import { usePickers } from '@/composables/usePickers';
import { orgDay } from '@/lib/dates';
import { fullName } from '@/lib/people';
import { zOptionalDate, zPhone, zText } from '@/lib/validation';
import type { LeadConversionResultDto, LeadDetailDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { leadsApi } from '../api';

/**
 * Lead → family → student → (optional) group, in one server transaction.
 * Prefilled from the lead; ends on a success screen with links to what was created.
 */
const props = defineProps<{ lead: Pick<LeadDetailDto, 'id' | 'name' | 'phone'> | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const { can } = usePermission();
const session = useSessionStore();
const pickers = usePickers();
const familyMode = ref<'new' | 'existing'>('new');
const result = ref<LeadConversionResultDto | null>(null);
const groupName = ref('');
const resultOpen = ref(false);

const schema = z
  .object({
    familyId: z.string().default(''),
    familyName: z.string().trim().default(''),
    familyPhone: z.string().trim().default(''),
    lastName: zText(80),
    firstName: zText(80),
    birthDate: zOptionalDate(),
    groupId: z.string().default(''),
    startedAt: zOptionalDate(),
  })
  .superRefine((values, context) => {
    if (familyMode.value === 'existing' && !values.familyId) {
      context.addIssue({ code: 'custom', path: ['familyId'], message: t('students.chooseFamily') });
    }
    if (familyMode.value === 'new') {
      if (values.familyName.length < 2) context.addIssue({ code: 'custom', path: ['familyName'], message: t('validation.required') });
      if (!zPhone().safeParse(values.familyPhone).success) context.addIssue({ code: 'custom', path: ['familyPhone'], message: t('validation.phone') });
    }
  });

const convert = useApiMutation({
  fn: (values: z.output<typeof schema>) =>
    leadsApi.convert(props.lead?.id ?? '', {
      ...(familyMode.value === 'existing'
        ? { familyId: values.familyId }
        : { family: { name: values.familyName, phone: zPhone().parse(values.familyPhone) } }),
      student: { firstName: values.firstName, lastName: values.lastName, birthDate: values.birthDate },
      groupId: values.groupId || undefined,
      startedAt: values.groupId ? values.startedAt : undefined,
    }),
  invalidates: [['leads'], ['families'], ['students'], ['groups'], ['enrollments'], ['dashboard']],
  onSuccess: (data) => {
    result.value = data;
    open.value = false;
    resultOpen.value = true;
  },
});

/** "Dilnoza Karimova" → first/last name guesses; the employee can fix them. */
function splitName(name: string): { firstName: string; lastName: string } {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
}

const { defineField, errors, onSubmit, formError, reset, isSubmitting, values } = useEntityForm({
  schema,
  initialValues: () => {
    const name = splitName(props.lead?.name ?? '');
    return {
      familyId: '',
      familyName: name.lastName ? t('leads.familyOf', { name: name.lastName }) : (props.lead?.name ?? ''),
      familyPhone: props.lead?.phone ?? '',
      lastName: name.lastName,
      firstName: name.firstName,
      birthDate: '',
      groupId: '',
      startedAt: orgDay(session.organization?.timezone),
    };
  },
  submit: (formValues) => convert.mutateAsync(formValues),
  fieldCodes: { GROUP_CAPACITY_FULL: 'groupId', GROUP_NOT_ACTIVE: 'groupId', FAMILY_INACTIVE: 'familyId' },
});
const [familyId] = defineField('familyId');
const [familyName] = defineField('familyName');
const [familyPhone] = defineField('familyPhone');
const [lastName] = defineField('lastName');
const [firstName] = defineField('firstName');
const [birthDate] = defineField('birthDate');
const [groupId] = defineField('groupId');
const [startedAt] = defineField('startedAt');

const canEnroll = computed(() => can(P.ENROLLMENTS_CREATE));
watch(open, (value) => {
  if (!value) return;
  familyMode.value = 'new';
  groupName.value = '';
  reset();
});
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="$t('leads.convertTitle')"
    :description="lead?.name"
    :submit-label="$t('leads.convert')"
    :loading="isSubmitting"
    :error="formError"
    size="lg"
    @submit="onSubmit"
  >
    <section class="flex flex-col gap-3">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-fg"><House class="size-4 text-fg-muted" aria-hidden="true" />1. {{ $t('students.family') }}</h3>
      <SegmentedControl
        v-model="familyMode"
        name="convert-family"
        :label="$t('students.family')"
        :options="[
          { value: 'new', label: $t('students.newFamily') },
          { value: 'existing', label: $t('students.existingFamily') },
        ]"
      />
      <div v-if="familyMode === 'new'" class="grid gap-4 sm:grid-cols-2">
        <FormField v-slot="field" :label="$t('families.name')" :error="errors.familyName">
          <AppInput :id="field.id" v-model="familyName" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-slot="field" :label="$t('students.parentPhone')" :error="errors.familyPhone">
          <AppInput :id="field.id" v-model="familyPhone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
      </div>
      <FormField v-else v-slot="field" :label="$t('students.family')" :error="errors.familyId">
        <EntityPicker :id="field.id" v-model="familyId" :search="pickers.families" :placeholder="$t('students.familySearch')" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </section>

    <section class="flex flex-col gap-3 border-t border-border pt-4">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-fg"><GraduationCap class="size-4 text-fg-muted" aria-hidden="true" />2. {{ $t('leads.studentStep') }}</h3>
      <div class="grid gap-4 sm:grid-cols-3">
        <FormField v-slot="field" :label="$t('students.lastName')" :error="errors.lastName">
          <AppInput :id="field.id" v-model="lastName" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-slot="field" :label="$t('students.firstName')" :error="errors.firstName">
          <AppInput :id="field.id" v-model="firstName" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-slot="field" :label="$t('students.birthDate')" optional :error="errors.birthDate">
          <AppDatePicker :id="field.id" v-model="birthDate" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
      </div>
    </section>

    <section v-if="canEnroll" class="flex flex-col gap-3 border-t border-border pt-4">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-fg">
        <UsersRound class="size-4 text-fg-muted" aria-hidden="true" />3. {{ $t('leads.groupStep') }}
        <span class="font-normal text-fg-subtle">({{ $t('common.optional') }})</span>
      </h3>
      <div class="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <FormField v-slot="field" :label="$t('enrollments.group')" :error="errors.groupId">
          <EntityPicker
            :id="field.id"
            v-model="groupId"
            :search="pickers.groups()"
            :placeholder="$t('enrollments.groupSearch')"
            :invalid="field.invalid"
            :described-by="field.describedBy"
            @select="groupName = $event?.label ?? ''"
          />
        </FormField>
        <FormField v-if="values.groupId" v-slot="field" :label="$t('enrollments.startDate')" :error="errors.startedAt">
          <AppDatePicker :id="field.id" v-model="startedAt" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
      </div>
    </section>
  </FormModal>

  <AppModal v-model:open="resultOpen" :title="$t('leads.convertedTitle')" size="sm">
    <div v-if="result" class="flex flex-col items-center gap-4 py-2 text-center">
      <span class="inline-flex size-14 items-center justify-center rounded-full bg-success-soft text-success"><CircleCheck class="size-8" aria-hidden="true" /></span>
      <p class="text-sm text-fg-muted">{{ $t('leads.convertedText') }}</p>
      <div class="flex w-full flex-col gap-2">
        <AppButton variant="secondary" block :icon="GraduationCap" :to="{ name: 'student', params: { id: result.student.id } }" @click="resultOpen = false">
          {{ fullName(result.student) }}
        </AppButton>
        <AppButton variant="secondary" block :icon="House" :to="{ name: 'family', params: { id: result.family.id } }" @click="resultOpen = false">
          {{ result.family.name }}
        </AppButton>
        <p v-if="result.enrollmentId" class="text-sm text-success">{{ $t('leads.enrolledInto', { group: groupName }) }}</p>
      </div>
    </div>
  </AppModal>
</template>

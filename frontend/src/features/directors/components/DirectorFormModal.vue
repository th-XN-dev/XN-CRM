<script setup lang="ts">
import { WandSparkles } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { useCenters } from '@/features/centers/api';
import { zId, zOptionalEmail, zOptionalPhone, zText } from '@/lib/validation';
import type { CreateDirectorDto, DirectorCredentialsDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { directorsApi } from '../api';
import { permissionsOf } from '../permission-modules';
import { generateTemporaryPassword } from '../temporary-password';
import ModulePicker from './ModulePicker.vue';

/** Adds a director to a center (fixed by `centerId`, or chosen here). */
const props = defineProps<{ centerId?: string }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ created: [credentials: DirectorCredentialsDto] }>();
const { t } = useI18n();
const centers = useCenters(() => ({ limit: 100, sortBy: 'name' as const, sortOrder: 'asc' as const }));
const centerOptions = computed(() =>
  (centers.data.value?.items ?? []).filter((c) => c.status !== 'ARCHIVED').map((c) => ({ value: c.id, label: c.name })),
);
const access = ref<'full' | 'custom'>('full');
const modules = ref<string[]>([]);
const modulesError = ref<string | undefined>();

const schema = z
  .object({
    centerId: zId(),
    name: zText(120),
    email: zOptionalEmail(),
    phone: zOptionalPhone(),
    temporaryPassword: z
      .string()
      .trim()
      .refine((v) => v === '' || (v.length >= 8 && v.length <= 128), () => ({ message: t('validation.min', { min: 8 }) }))
      .transform((v) => v || undefined),
  })
  .superRefine((value, context) => {
    if (!value.email && !value.phone) context.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: t('validation.login') });
  });

const save = useApiMutation({
  fn: (body: CreateDirectorDto) => directorsApi.create(body),
  invalidates: [['owner']],
  success: () => t('owner.directors.created'),
  onSuccess: (result) => {
    open.value = false;
    emit('created', result);
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting, setFieldValue } = useEntityForm({
  schema,
  initialValues: () => ({ centerId: props.centerId ?? '', name: '', email: '', phone: '', temporaryPassword: '' }),
  submit: (values) => {
    modulesError.value = access.value === 'custom' && modules.value.length === 0 ? t('validation.choose') : undefined;
    if (modulesError.value) return Promise.resolve();
    return save.mutateAsync({
      ...values,
      permissions: access.value === 'custom' ? (permissionsOf(modules.value) as CreateDirectorDto['permissions']) : undefined,
    });
  },
  fieldCodes: { MEMBER_ALREADY_EXISTS: 'email', USER_ALREADY_EXISTS: 'email' },
});
const [centerField] = defineField('centerId');
const [name] = defineField('name');
const [email] = defineField('email');
const [phone] = defineField('phone');
const [temporaryPassword] = defineField('temporaryPassword');
const accessOptions = computed(() => [
  { value: 'full' as const, label: t('owner.wizard.permissionsFull') },
  { value: 'custom' as const, label: t('owner.wizard.permissionsCustom') },
]);
watch(open, (value) => {
  if (!value) return;
  reset();
  access.value = 'full';
  modules.value = [];
  modulesError.value = undefined;
});
</script>

<template>
  <FormModal v-model:open="open" :title="$t('owner.directors.new')" :description="$t('owner.wizard.directorHint')" :loading="isSubmitting" :error="formError" @submit="onSubmit">
    <FormField v-if="!props.centerId" v-slot="field" :label="$t('owner.directors.center')" :error="errors.centerId">
      <AppSelect :id="field.id" v-model="centerField" :options="centerOptions" :placeholder="$t('validation.choose')" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('owner.directors.name')" :error="errors.name">
      <AppInput :id="field.id" v-model="name" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('owner.directors.email')" :error="errors.email">
        <AppInput :id="field.id" v-model="email" type="email" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('owner.directors.phone')" :error="errors.phone" optional>
        <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-slot="field" :label="$t('owner.wizard.temporaryPassword')" :hint="$t('owner.wizard.temporaryPasswordHint')" :error="errors.temporaryPassword" optional>
      <div class="flex gap-2">
        <AppInput :id="field.id" v-model="temporaryPassword" autocomplete="new-password" spellcheck="false" class="font-mono" :invalid="field.invalid" :described-by="field.describedBy" />
        <AppButton variant="secondary" :icon="WandSparkles" @click="setFieldValue('temporaryPassword', generateTemporaryPassword())">{{ $t('owner.wizard.generate') }}</AppButton>
      </div>
    </FormField>
    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium text-fg" aria-hidden="true">{{ $t('owner.wizard.permissions') }}</p>
      <AppRadioGroup v-model="access" :options="accessOptions" :label="$t('owner.wizard.permissions')" name="new-director-access" />
      <ModulePicker v-if="access === 'custom'" v-model="modules" />
      <p v-if="modulesError" class="text-sm text-danger" role="alert">{{ modulesError }}</p>
    </div>
  </FormModal>
</template>

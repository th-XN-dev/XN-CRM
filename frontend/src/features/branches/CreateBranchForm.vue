<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormError from '@/components/forms/FormError.vue';
import FormField from '@/components/forms/FormField.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { organizationsApi } from '@/features/organizations/api';
import { isApiError } from '@/services/api/api-error';
import { useSessionStore } from '@/stores/session.store';

const emit = defineEmits<{ created: [branchId: string] }>();
const { t } = useI18n();
const session = useSessionStore();
const formError = ref<string | null>(null);

const schema = computed(() =>
  toTypedSchema(
    z.object({
      name: z.string({ required_error: t('validation.required') }).trim().min(2, t('validation.min', { min: 2 })).max(120),
      code: z
        .string({ required_error: t('validation.required') })
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{2,16}$/, t('validation.code')),
    }),
  ),
);
const { defineField, handleSubmit, errors, isSubmitting, setErrors } = useForm({
  validationSchema: schema,
  initialValues: { name: '', code: '' },
});
const [name, nameAttrs] = defineField('name');
const [code, codeAttrs] = defineField('code');

const submit = handleSubmit(async (values) => {
  formError.value = null;
  const organizationId = session.organizationId;
  if (!organizationId) return;
  try {
    const branch = await organizationsApi.createBranch(organizationId, values);
    // The parent reloads the context: doing it here would replace this form by
    // the branch list (unmounting it) before the event could be delivered.
    emit('created', branch.id);
  } catch (error) {
    if (isApiError(error) && error.code === 'BRANCH_CODE_TAKEN') setErrors({ code: apiErrorMessage(error) });
    else formError.value = apiErrorMessage(error);
  }
});
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit="submit">
    <FormField v-slot="field" :label="$t('onboarding.branchName')" :error="errors.name">
      <AppInput
        :id="field.id"
        v-model="name"
        v-bind="nameAttrs"
        :placeholder="$t('onboarding.branchNamePlaceholder')"
        :invalid="field.invalid"
        :described-by="field.describedBy"
      />
    </FormField>
    <FormField v-slot="field" :label="$t('onboarding.branchCode')" :hint="$t('onboarding.branchCodeHint')" :error="errors.code">
      <AppInput
        :id="field.id"
        v-model="code"
        v-bind="codeAttrs"
        placeholder="TRM"
        autocapitalize="characters"
        :invalid="field.invalid"
        :described-by="field.describedBy"
      />
    </FormField>
    <FormError :message="formError" />
    <AppButton type="submit" block :loading="isSubmitting">{{ $t('onboarding.createBranch') }}</AppButton>
  </form>
</template>

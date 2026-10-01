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
import { useContextSwitch } from '@/composables/useContextSwitch';
import { useAuthStore } from '@/stores/auth.store';
import { organizationsApi } from './api';

const { t } = useI18n();
const auth = useAuthStore();
const { switchOrganization } = useContextSwitch();
const formError = ref<string | null>(null);

const schema = computed(() =>
  toTypedSchema(
    z.object({
      name: z
        .string({ required_error: t('validation.required') })
        .trim()
        .min(2, t('validation.min', { min: 2 }))
        .max(160, t('validation.max', { max: 160 })),
    }),
  ),
);
const { defineField, handleSubmit, errors, isSubmitting } = useForm({ validationSchema: schema, initialValues: { name: '' } });
const [name, nameAttrs] = defineField('name');

const submit = handleSubmit(async (values) => {
  formError.value = null;
  try {
    const organization = await organizationsApi.create(values.name);
    await auth.loadProfile();
    await switchOrganization(organization.id);
  } catch (error) {
    formError.value = apiErrorMessage(error);
  }
});
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit="submit">
    <FormField v-slot="field" :label="$t('onboarding.organizationName')" :error="errors.name">
      <AppInput
        :id="field.id"
        v-model="name"
        v-bind="nameAttrs"
        :placeholder="$t('onboarding.organizationNamePlaceholder')"
        :invalid="field.invalid"
        :described-by="field.describedBy"
        autocomplete="organization"
      />
    </FormField>
    <FormError :message="formError" />
    <AppButton type="submit" block :loading="isSubmitting">{{ $t('onboarding.createOrganization') }}</AppButton>
  </form>
</template>

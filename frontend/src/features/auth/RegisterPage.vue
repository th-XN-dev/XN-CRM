<script setup lang="ts">
import { Lock, Mail, UserRound } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { z } from 'zod';
import FormError from '@/components/forms/FormError.vue';
import FormField from '@/components/forms/FormField.vue';
import OnboardingLayout from '@/components/layout/OnboardingLayout.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { normalizePhone, zText } from '@/lib/validation';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Create an account (email or phone). Afterwards the organization step takes
 * over: create your own organization or wait for an invitation.
 */
const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const schema = z
  .object({
    name: zText(120, 2),
    login: z.string().trim().min(1),
    password: z.string().min(8).max(128),
    confirm: z.string().min(1),
  })
  .superRefine((values, context) => {
    if (!EMAIL.test(values.login) && !normalizePhone(values.login)) {
      context.addIssue({ code: 'custom', path: ['login'], message: t('validation.login') });
    }
    if (values.confirm !== values.password) {
      context.addIssue({ code: 'custom', path: ['confirm'], message: t('auth.passwordsDiffer') });
    }
  });

const { defineField, errors, onSubmit, formError, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({ name: '', login: '', password: '', confirm: '' }),
  submit: async (values) => {
    const contact = EMAIL.test(values.login) ? { email: values.login } : { phone: normalizePhone(values.login) ?? values.login };
    await auth.register({ name: values.name, password: values.password, ...contact });
    await router.replace({ name: 'select-organization' });
  },
  fieldCodes: { USER_ALREADY_EXISTS: 'login' },
});
const [name] = defineField('name');
const [login] = defineField('login');
const [password] = defineField('password');
const [confirm] = defineField('confirm');
</script>

<template>
  <OnboardingLayout :title="$t('auth.registerTitle')" :subtitle="$t('auth.registerSubtitle')">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
      <FormField v-slot="field" :label="$t('auth.fullName')" :error="errors.name">
        <AppInput :id="field.id" v-model="name" :icon="UserRound" autocomplete="name" :invalid="field.invalid" :described-by="field.describedBy" autofocus />
      </FormField>
      <FormField v-slot="field" :label="$t('auth.login')" :error="errors.login">
        <AppInput
          :id="field.id"
          v-model="login"
          :icon="Mail"
          :placeholder="$t('auth.loginPlaceholder')"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          :invalid="field.invalid"
          :described-by="field.describedBy"
        />
      </FormField>
      <FormField v-slot="field" :label="$t('auth.password')" :hint="$t('auth.passwordHint')" :error="errors.password">
        <AppInput :id="field.id" v-model="password" :icon="Lock" type="password" autocomplete="new-password" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('auth.confirmPassword')" :error="errors.confirm">
        <AppInput :id="field.id" v-model="confirm" :icon="Lock" type="password" autocomplete="new-password" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormError :message="formError" />
      <AppButton type="submit" size="lg" block :loading="isSubmitting">
        {{ isSubmitting ? $t('auth.creatingAccount') : $t('auth.createAccount') }}
      </AppButton>
    </form>
    <p class="mt-6 text-center text-sm text-fg-muted">
      {{ $t('auth.haveAccount') }}
      <RouterLink :to="{ name: 'login' }" class="focus-ring rounded font-medium text-primary-text hover:underline">{{ $t('auth.submit') }}</RouterLink>
    </p>
  </OnboardingLayout>
</template>

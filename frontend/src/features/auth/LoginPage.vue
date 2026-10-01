<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { Eye, EyeOff, Lock, Mail } from 'lucide-vue-next';
import { useForm } from 'vee-validate';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { z } from 'zod';
import FormError from '@/components/forms/FormError.vue';
import FormField from '@/components/forms/FormField.vue';
import OnboardingLayout from '@/components/layout/OnboardingLayout.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { isApiError } from '@/services/api/api-error';
import { useAuthStore } from '@/stores/auth.store';

const { t } = useI18n();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const showPassword = ref(false);
const formError = ref<string | null>(
  route.query.expired ? t('auth.sessionExpired') : route.query.signedOut ? t('auth.signedOutElsewhere') : null,
);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[1-9]\d{7,14}$/;

const schema = computed(() =>
  toTypedSchema(
    z.object({
      login: z
        .string({ required_error: t('validation.required') })
        .trim()
        .min(1, t('validation.required'))
        .refine((value) => EMAIL.test(value) || PHONE.test(value.replace(/[\s\-()]/g, '')), t('validation.login')),
      password: z.string({ required_error: t('validation.required') }).min(1, t('validation.required')),
    }),
  ),
);

const { defineField, handleSubmit, errors, isSubmitting, setErrors } = useForm({
  validationSchema: schema,
  initialValues: { login: '', password: '' },
});
const [login, loginAttrs] = defineField('login');
const [password, passwordAttrs] = defineField('password');

const submit = handleSubmit(async (values) => {
  formError.value = null;
  try {
    // The API normalizes emails and phone numbers itself.
    await auth.login(values.login, values.password);
    const redirect = route.query.redirect;
    await router.replace(
      typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/',
    );
  } catch (error) {
    if (isApiError(error) && error.isValidation) {
      setErrors(Object.fromEntries(Object.keys(error.fieldErrors).map((field) => [field, t('validation.invalid')])));
    }
    formError.value = apiErrorMessage(error);
  }
});
</script>

<template>
  <OnboardingLayout :title="$t('auth.loginTitle')" :subtitle="$t('auth.loginSubtitle')">
    <form class="flex flex-col gap-4" novalidate @submit="submit">
      <FormField v-slot="field" :label="$t('auth.login')" :error="errors.login">
        <AppInput
          :id="field.id"
          v-model="login"
          v-bind="loginAttrs"
          :icon="Mail"
          :placeholder="$t('auth.loginPlaceholder')"
          :invalid="field.invalid"
          :described-by="field.describedBy"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          inputmode="email"
          autofocus
        />
      </FormField>
      <FormField v-slot="field" :label="$t('auth.password')" :error="errors.password">
        <AppInput
          :id="field.id"
          v-model="password"
          v-bind="passwordAttrs"
          :icon="Lock"
          :type="showPassword ? 'text' : 'password'"
          :invalid="field.invalid"
          :described-by="field.describedBy"
          autocomplete="current-password"
        >
          <template #trailing>
            <button
              type="button"
              class="focus-ring inline-flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover"
              :aria-label="showPassword ? $t('auth.hidePassword') : $t('auth.showPassword')"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <component :is="showPassword ? EyeOff : Eye" class="size-4.5" aria-hidden="true" />
            </button>
          </template>
        </AppInput>
      </FormField>
      <FormError :message="formError" />
      <AppButton type="submit" size="lg" block :loading="isSubmitting">
        {{ isSubmitting ? $t('auth.signingIn') : $t('auth.submit') }}
      </AppButton>
    </form>
    <p class="mt-6 text-center text-sm text-fg-muted">
      {{ $t('auth.noAccount') }}
      <RouterLink :to="{ name: 'register' }" class="focus-ring rounded font-medium text-primary-text hover:underline">{{ $t('auth.createAccount') }}</RouterLink>
    </p>
  </OnboardingLayout>
</template>

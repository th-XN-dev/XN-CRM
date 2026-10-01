<script setup lang="ts">
import { Eye, EyeOff, Lock } from 'lucide-vue-next';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormError from '@/components/forms/FormError.vue';
import FormField from '@/components/forms/FormField.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { authApi } from '@/features/auth/api';

/** Current + new password (twice). Also the first-login form for temporary passwords. */
defineProps<{ submitLabel?: string }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const show = ref(false);

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
    repeat: z.string(),
  })
  .superRefine((value, context) => {
    if (value.repeat !== value.newPassword) context.addIssue({ code: z.ZodIssueCode.custom, path: ['repeat'], message: t('auth.passwordsDiffer') });
    if (value.newPassword && value.newPassword === value.currentPassword) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['newPassword'], message: t('account.password.sameAsOld') });
    }
  });
const { defineField, errors, onSubmit, formError, isSubmitting, resetForm } = useEntityForm({
  schema,
  initialValues: () => ({ currentPassword: '', newPassword: '', repeat: '' }),
  submit: async (values) => {
    await authApi.changePassword(values.currentPassword, values.newPassword);
    resetForm({ values: { currentPassword: '', newPassword: '', repeat: '' } });
    emit('changed');
  },
  fieldCodes: { INVALID_CURRENT_PASSWORD: 'currentPassword' },
});
const [currentPassword] = defineField('currentPassword');
const [newPassword] = defineField('newPassword');
const [repeat] = defineField('repeat');
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit="onSubmit">
    <FormField v-slot="field" :label="$t('account.password.current')" :error="errors.currentPassword">
      <AppInput :id="field.id" v-model="currentPassword" :icon="Lock" :type="show ? 'text' : 'password'" autocomplete="current-password" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('account.password.new')" :hint="$t('account.password.text')" :error="errors.newPassword">
      <AppInput :id="field.id" v-model="newPassword" :icon="Lock" :type="show ? 'text' : 'password'" autocomplete="new-password" :invalid="field.invalid" :described-by="field.describedBy">
        <template #trailing>
          <button
            type="button"
            class="focus-ring inline-flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover"
            :aria-label="show ? $t('auth.hidePassword') : $t('auth.showPassword')"
            :aria-pressed="show"
            @click="show = !show"
          >
            <component :is="show ? EyeOff : Eye" class="size-4.5" aria-hidden="true" />
          </button>
        </template>
      </AppInput>
    </FormField>
    <FormField v-slot="field" :label="$t('account.password.repeat')" :error="errors.repeat">
      <AppInput :id="field.id" v-model="repeat" :icon="Lock" :type="show ? 'text' : 'password'" autocomplete="new-password" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormError :message="formError" />
    <AppButton type="submit" :loading="isSubmitting" class="self-start">{{ submitLabel ?? $t('account.password.submit') }}</AppButton>
  </form>
</template>

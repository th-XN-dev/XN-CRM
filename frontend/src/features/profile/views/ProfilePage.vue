<script setup lang="ts">
import { LogOut, Monitor, Smartphone } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import SectionCard from '@/components/data/SectionCard.vue';
import FormError from '@/components/forms/FormError.vue';
import FormField from '@/components/forms/FormField.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { useFormatters } from '@/composables/useFormatters';
import { authApi } from '@/features/auth/api';
import { normalizePhone, zText } from '@/lib/validation';
import { useAccountQuery } from '@/services/query/useAccountQuery';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useAuthStore } from '@/stores/auth.store';
import { useToastStore } from '@/stores/toast.store';
import ChangePasswordForm from '../components/ChangePasswordForm.vue';

/** Own name and login, password, signed-in devices (owner, directors and staff alike). */
const { t } = useI18n();
const auth = useAuthStore();
const toast = useToastStore();
const format = useFormatters();
const profile = computed(() => auth.profile);

const schema = z
  .object({
    name: zText(120),
    email: z.string().trim(),
    phone: z.string().trim(),
    currentPassword: z.string(),
  })
  .superRefine((value, context) => {
    if (value.email && !z.string().email().safeParse(value.email).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: t('validation.email') });
    }
    if (value.phone && !normalizePhone(value.phone)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: t('validation.phone') });
    if (!value.email && !value.phone) context.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: t('validation.login') });
  });
const { defineField, errors, onSubmit, formError, isSubmitting, values, resetForm } = useEntityForm({
  schema,
  initialValues: () => ({ name: profile.value?.name ?? '', email: profile.value?.email ?? '', phone: profile.value?.phone ?? '', currentPassword: '' }),
  submit: async (v) => {
    const email = v.email || undefined;
    const phone = v.phone ? (normalizePhone(v.phone) ?? v.phone) : undefined;
    const loginChanged = (email ?? null) !== profile.value?.email || (phone ?? null) !== profile.value?.phone;
    auth.profile = await authApi.updateMe({
      name: v.name,
      ...(loginChanged && { email, phone, currentPassword: v.currentPassword }),
    });
    resetForm({ values: { name: auth.profile.name, email: auth.profile.email ?? '', phone: auth.profile.phone ?? '', currentPassword: '' } });
    toast.success(t('account.profile.saved'));
  },
  fieldCodes: { INVALID_CURRENT_PASSWORD: 'currentPassword', USER_ALREADY_EXISTS: 'email' },
});
const [name] = defineField('name');
const [email] = defineField('email');
const [phone] = defineField('phone');
const [currentPassword] = defineField('currentPassword');
/** The password is asked only when the way of signing in changes. */
const loginChanging = computed(
  () => (values.email ?? '').trim() !== (profile.value?.email ?? '') || (values.phone ?? '').trim() !== (profile.value?.phone ?? ''),
);

const sessions = useAccountQuery({ key: ['account', 'sessions'], fn: authApi.sessions });
const revoke = useApiMutation({
  fn: (id: string) => authApi.revokeSession(id),
  success: () => t('account.sessions.signedOut'),
  toastError: true,
  onSuccess: () => void sessions.refetch(),
});
const revokeOthers = useApiMutation({
  fn: () => authApi.revokeOtherSessions(),
  success: () => t('account.sessions.othersSignedOut'),
  toastError: true,
  onSuccess: () => void sessions.refetch(),
});
const isPhone = (agent: string | null) => !!agent && /Mobile|Android|iPhone/i.test(agent);
/** "Chrome · macOS" from a user agent, without a parser dependency. */
function device(agent: string | null): string {
  if (!agent) return t('account.sessions.unknown');
  const browser = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : null;
  const os = /Windows/.test(agent) ? 'Windows' : /Mac OS X/.test(agent) ? 'macOS' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Linux/.test(agent) ? 'Linux' : null;
  return [browser, os].filter(Boolean).join(' · ') || t('account.sessions.unknown');
}
function passwordChanged(): void {
  toast.success(t('account.password.changed'));
  void sessions.refetch();
}
</script>

<template>
  <PageHeader :title="$t('account.profile.title')" :description="$t('account.profile.subtitle')" />
  <div class="grid gap-4 lg:grid-cols-2">
    <SectionCard :title="$t('account.profile.details')">
      <form class="flex flex-col gap-4" novalidate @submit="onSubmit">
        <FormField v-slot="field" :label="$t('account.profile.name')" :error="errors.name">
          <AppInput :id="field.id" v-model="name" autocomplete="name" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-slot="field" :label="$t('account.profile.email')" :error="errors.email">
          <AppInput :id="field.id" v-model="email" type="email" autocomplete="email" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-slot="field" :label="$t('account.profile.phone')" :error="errors.phone" optional>
          <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" autocomplete="tel" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-if="loginChanging" v-slot="field" :label="$t('account.profile.currentPassword')" :hint="$t('account.profile.loginHint')" :error="errors.currentPassword">
          <AppInput :id="field.id" v-model="currentPassword" type="password" autocomplete="current-password" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormError :message="formError" />
        <AppButton type="submit" class="self-start" :loading="isSubmitting">{{ $t('common.save') }}</AppButton>
      </form>
    </SectionCard>

    <SectionCard :title="$t('account.password.title')">
      <ChangePasswordForm @changed="passwordChanged" />
    </SectionCard>

    <SectionCard :title="$t('account.sessions.title')" :description="$t('account.sessions.text')" class="lg:col-span-2">
      <QueryState :loading="sessions.isPending.value" :error="sessions.error.value" loading-variant="list" @retry="sessions.refetch()">
        <ul class="divide-y divide-border">
          <li v-for="session in sessions.data.value ?? []" :key="session.id" class="flex flex-wrap items-center gap-3 py-3">
            <component :is="isPhone(session.userAgent) ? Smartphone : Monitor" class="size-5 text-fg-subtle" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-fg">
                {{ device(session.userAgent) }}
                <AppBadge v-if="session.current" class="ml-2" tone="success">{{ $t('account.sessions.current') }}</AppBadge>
              </p>
              <p class="text-xs text-fg-muted">{{ $t('account.sessions.since', { date: format.dateTime(session.lastActiveAt) }) }}<template v-if="session.ipAddress"> · {{ session.ipAddress }}</template></p>
            </div>
            <AppButton v-if="!session.current" variant="ghost" size="sm" :icon="LogOut" :loading="revoke.isPending.value && revoke.variables.value === session.id" @click="revoke.mutate(session.id)">
              {{ $t('account.sessions.signOut') }}
            </AppButton>
          </li>
        </ul>
        <p v-if="(sessions.data.value?.length ?? 0) <= 1" class="py-2 text-sm text-fg-muted">{{ $t('account.sessions.onlyThis') }}</p>
        <AppButton v-else class="mt-3" variant="secondary" :icon="LogOut" :loading="revokeOthers.isPending.value" @click="revokeOthers.mutate()">
          {{ $t('account.sessions.signOutOthers') }}
        </AppButton>
      </QueryState>
    </SectionCard>
  </div>
</template>

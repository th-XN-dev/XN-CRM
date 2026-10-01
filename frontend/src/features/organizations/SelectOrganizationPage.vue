<script setup lang="ts">
import { Building2, ChevronRight, Crown, LogOut } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import FormError from '@/components/forms/FormError.vue';
import OnboardingLayout from '@/components/layout/OnboardingLayout.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppSpinner from '@/components/ui/AppSpinner.vue';
import AppAlert from '@/components/ui/AppAlert.vue';
import OrgTile from '@/components/ui/OrgTile.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { useContextSwitch } from '@/composables/useContextSwitch';
import { useSignOut } from '@/composables/useSignOut';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth.store';
import CreateOrganizationForm from './CreateOrganizationForm.vue';

const auth = useAuthStore();
const route = useRoute();
const { t } = useI18n();
const { switchOrganization } = useContextSwitch();
const signOut = useSignOut();
const pending = ref<string | null>(null);
const error = ref<string | null>(null);
const organizations = computed(() => auth.profile?.organizations ?? []);
const redirect = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/'));
/** Why the user was sent here: their center was frozen or its period ended meanwhile. */
const blocked = computed(() => (typeof route.query.blocked === 'string' ? t(`errors.${route.query.blocked}`) : null));
/** Frozen / expired centers are listed (so people know why) but can't be opened. */
const reasonCode: Record<string, string> = {
  FROZEN: 'CENTER_FROZEN',
  EXPIRED: 'CENTER_EXPIRED',
  NOT_STARTED: 'CENTER_NOT_STARTED',
  ARCHIVED: 'CENTER_ARCHIVED',
};

async function choose(id: string): Promise<void> {
  const org = organizations.value.find((o) => o.id === id);
  if (org && org.availability !== 'ACTIVE') {
    error.value = t(`errors.${reasonCode[org.availability] ?? 'CENTER_FROZEN'}`);
    return;
  }
  pending.value = id;
  error.value = null;
  try {
    await switchOrganization(id, redirect.value);
  } catch (e) {
    error.value = apiErrorMessage(e);
  } finally {
    pending.value = null;
  }
}
</script>

<template>
  <OnboardingLayout
    :title="organizations.length ? $t('onboarding.selectOrganization') : $t('onboarding.createOrganization')"
    :subtitle="organizations.length ? $t('onboarding.selectOrganizationHint') : undefined"
  >
    <AppAlert v-if="blocked" tone="warning" class="mb-4">{{ blocked }}</AppAlert>
    <ul v-if="organizations.length" class="flex flex-col gap-2">
      <li v-for="org in organizations" :key="org.id">
        <button
          type="button"
          class="focus-ring flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition-colors hover:border-primary hover:bg-surface-hover disabled:opacity-60"
          :class="org.availability !== 'ACTIVE' && 'opacity-70'"
          :disabled="!!pending"
          :aria-disabled="org.availability !== 'ACTIVE' || undefined"
          @click="choose(org.id)"
        >
          <OrgTile :name="org.name" :color="org.primaryColor" :logo-url="org.logoUrl" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-fg">{{ org.name }}</span>
            <span class="block truncate text-sm text-fg-muted">{{ $t('onboarding.role', { role: $te(`roles.${org.role.key}`) ? $t(`roles.${org.role.key}`) : org.role.name }) }}</span>
          </span>
          <AppSpinner v-if="pending === org.id" size="sm" />
          <StatusBadge v-else-if="org.availability !== 'ACTIVE'" kind="availability" :value="org.availability" />
          <ChevronRight v-else class="size-5 text-fg-subtle" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <template v-else>
      <EmptyState compact :icon="Building2" :title="$t('onboarding.noOrganizations')" :text="$t('onboarding.noOrganizationsHint')" />
      <CreateOrganizationForm />
    </template>
    <FormError class="mt-4" :message="error" />
    <AppButton v-if="auth.profile?.platformRole === 'OWNER'" class="mt-4" variant="secondary" block :icon="Crown" to="/owner">{{ $t('account.menu.ownerArea') }}</AppButton>
    <AppButton class="mt-6" variant="ghost" block :icon="LogOut" @click="signOut">{{ $t('auth.logout') }}</AppButton>
  </OnboardingLayout>
</template>

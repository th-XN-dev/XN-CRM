<script setup lang="ts">
import { LogOut } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import OnboardingLayout from '@/components/layout/OnboardingLayout.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useSignOut } from '@/composables/useSignOut';
import ChangePasswordForm from '@/features/profile/components/ChangePasswordForm.vue';
import { useAuthStore } from '@/stores/auth.store';

/** First sign-in with a temporary password: choose your own before anything else. */
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const signOut = useSignOut();

async function done(): Promise<void> {
  await auth.loadProfile();
  const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//') ? route.query.redirect : '/';
  await router.replace(redirect);
}
</script>

<template>
  <OnboardingLayout :title="$t('account.firstLogin.title')" :subtitle="$t('account.firstLogin.subtitle')">
    <ChangePasswordForm :submit-label="$t('account.firstLogin.submit')" @changed="done" />
    <AppButton class="mt-6" variant="ghost" block :icon="LogOut" @click="signOut">{{ $t('auth.logout') }}</AppButton>
  </OnboardingLayout>
</template>

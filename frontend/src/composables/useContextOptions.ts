import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth.store';
import { ALL_BRANCHES, useSessionStore } from '@/stores/session.store';

/** Centers and branches the user can switch between (header and mobile sheet). */
export function useContextOptions() {
  const auth = useAuthStore();
  const session = useSessionStore();
  const { t } = useI18n();

  // Frozen/expired centers can't be opened; the center selector page explains why.
  const organizations = computed(() => (auth.profile?.organizations ?? []).filter((o) => o.availability === 'ACTIVE'));
  const branchOptions = computed(() => [
    ...(session.canChooseAllBranches ? [{ id: ALL_BRANCHES, name: t('onboarding.allBranches') }] : []),
    ...session.branches,
  ]);
  const currentBranchName = computed(() =>
    session.branchId === ALL_BRANCHES ? t('onboarding.allBranches') : (session.currentBranch?.name ?? ''),
  );

  return {
    organizations,
    branchOptions,
    currentBranchName,
    canSwitchOrganization: computed(() => organizations.value.length > 1),
    canSwitchBranch: computed(() => branchOptions.value.length > 1),
  };
}

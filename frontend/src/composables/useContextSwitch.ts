import { useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { setLocale } from '@/i18n';
import { usePreferencesStore } from '@/stores/preferences.store';
import { useSessionStore } from '@/stores/session.store';

/**
 * Switching organization or branch changes what every query returns, so the
 * cache is reset (organization) or refetched (branch).
 */
export function useContextSwitch() {
  const session = useSessionStore();
  const preferences = usePreferencesStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  async function switchOrganization(id: string, redirect = '/'): Promise<void> {
    const context = await session.selectOrganization(id);
    queryClient.clear();
    await setLocale(preferences.resolveLocale(context.organization.language));
    await router.push(session.branchId ? redirect : { name: 'select-branch', query: { redirect } });
  }

  async function switchBranch(id: string, redirect?: string): Promise<void> {
    session.selectBranch(id);
    await queryClient.invalidateQueries();
    if (redirect) await router.push(redirect);
  }

  return { switchOrganization, switchBranch };
}

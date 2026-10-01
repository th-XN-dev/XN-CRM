import type { Router } from 'vue-router';
import { storageKeys } from '@/app/config/app.config';
import { i18n } from '@/i18n';
import { clearRecentResults } from '@/features/search/recent';
import { configureHttp } from '@/services/api/http';
import { useAuthStore } from '@/stores/auth.store';
import { useSessionStore } from '@/stores/session.store';
import { queryClient } from './query-client';

/** Connects the API client to the session: tokens, tenant headers, refresh, expiry. */
export function setupHttp(router: Router): void {
  const auth = useAuthStore();
  const session = useSessionStore();

  configureHttp({
    getAccessToken: () => auth.accessToken,
    getTenant: () => ({ organizationId: session.organizationId, branchId: session.apiBranchId }),
    getLocale: () => i18n.global.locale.value,
    refresh: () => auth.refresh(),
    onSessionExpired: () => {
      auth.clear();
      queryClient.clear();
      clearRecentResults();
      const current = router.currentRoute.value;
      if (current.name !== 'login') {
        void router.push({ name: 'login', query: { redirect: current.fullPath, expired: '1' } });
      }
    },
    onAccessBlocked: (code) => {
      const current = router.currentRoute.value;
      if (current.meta.public) return; // e.g. the sign-in form shows the reason itself
      if (code === 'PASSWORD_CHANGE_REQUIRED') {
        if (current.name !== 'change-password') void router.push({ name: 'change-password' });
        return;
      }
      // The center was frozen or its period ended while someone was working in it.
      if (current.meta.platform || current.name === 'select-organization') return;
      queryClient.clear();
      session.forgetOrganization();
      void auth.loadProfile().finally(() => router.push({ name: 'select-organization', query: { blocked: code } }));
    },
  });

  // Other tabs: signing out there ends the session here; signing in there
  // (while this tab shows the login page) continues here too.
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKeys.refreshToken) return;
    const current = router.currentRoute.value;
    if (!event.newValue && auth.accessToken) {
      auth.clear();
      queryClient.clear();
      session.clear();
      clearRecentResults();
      void router.push({ name: 'login', query: { signedOut: '1' } });
    } else if (event.newValue && !auth.accessToken && current.meta.public) {
      void router.push(typeof current.query.redirect === 'string' ? current.query.redirect : '/');
    }
  });
}

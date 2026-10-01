import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router';
import { navigation } from '@/app/config/navigation';
import { setLocale } from '@/i18n';
import { useAuthStore } from '@/stores/auth.store';
import { usePreferencesStore } from '@/stores/preferences.store';
import { useSessionStore } from '@/stores/session.store';

/**
 * Sign-in → (temporary password) → owner area | center → branch → permission.
 * Screens that have nothing to ask (a single center or branch) are skipped.
 * The API decides everything again on every request; this only routes.
 */
export function installGuards(router: Router): void {
  router.beforeEach(async (to): Promise<RouteLocationRaw | boolean> => {
    const auth = useAuthStore();
    const session = useSessionStore();
    const preferences = usePreferencesStore();

    await auth.restore();

    if (to.meta.public) {
      return auth.isAuthenticated && (to.name === 'login' || to.name === 'register') ? redirectTarget(to) : true;
    }
    if (!auth.isAuthenticated || !auth.profile) {
      return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
    }

    const profile = auth.profile;
    session.bindUser(profile.id);
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : to.fullPath;

    // ── account: a temporary password is replaced before anything else ──
    if (profile.mustChangePassword) {
      return to.name === 'change-password' ? true : { name: 'change-password', query: { redirect } };
    }
    if (to.meta.stage === 'account') return redirectTarget(to);

    // ── platform owner area ──
    const isOwner = profile.platformRole === 'OWNER';
    if (to.matched.some((record) => record.meta.platform)) return isOwner ? true : '/';
    if (isOwner && profile.organizations.length === 0) return { name: 'owner-dashboard' };

    // ── organization (center) ──
    if (to.meta.stage === 'organization') return true;
    const usable = profile.organizations.filter((o) => o.availability === 'ACTIVE');
    const known = usable.some((o) => o.id === session.organizationId);
    let organizationId = known ? session.organizationId : null;
    if (!organizationId && usable.length === 1 && profile.organizations.length === 1) {
      organizationId = usable[0]?.id ?? null;
    }
    if (!organizationId) return { name: 'select-organization', query: { redirect } };
    if (session.context?.organization.id !== organizationId) {
      try {
        const context = await session.selectOrganization(organizationId);
        await setLocale(preferences.resolveLocale(context.organization.language));
      } catch {
        session.forgetOrganization();
        return { name: 'select-organization', query: { redirect } };
      }
    }

    // ── branch ──
    if (to.meta.stage === 'branch') return true;
    if (!session.branchId) return { name: 'select-branch', query: { redirect } };

    // ── permission ── (hide what the member can't use; the API enforces it anyway)
    const required = to.matched.map((record) => record.meta.permission).filter(Boolean);
    if (required.every((permission) => session.can(permission))) return true;
    if (to.name === 'dashboard') {
      const first = navigation.find((item) => item.to !== '/' && session.can(item.permission));
      if (first) return first.to;
    }
    return { name: 'forbidden', query: { from: to.fullPath } };
  });
}

function redirectTarget(to: RouteLocationNormalized): RouteLocationRaw {
  const redirect = to.query.redirect;
  // Only same-app paths: never redirect to another origin after login.
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/';
}

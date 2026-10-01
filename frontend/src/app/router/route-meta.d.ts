import 'vue-router';
import type { PermissionRequirement } from '@/app/config/permissions';

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without signing in (login). */
    public?: boolean;
    /**
     * Steps before a full center/branch context: `account` needs only a
     * signed-in user (password change), `organization`/`branch` are the selectors.
     */
    stage?: 'account' | 'organization' | 'branch';
    /** The platform owner's area (/owner): no center context, owner role required. */
    platform?: boolean;
    /** i18n key of the page title (tab title and headers). */
    titleKey?: string;
    /** Any of these permissions is required; the API still enforces access. */
    permission?: PermissionRequirement;
  }
}

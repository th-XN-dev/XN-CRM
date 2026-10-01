/**
 * Platform-level permissions (outside any center). They belong to the
 * platform OWNER (`User.platformRole`), never to a center role, so a center's
 * staff permissions can't reach them and the owner isn't bound by those.
 */
export const PLATFORM_PERMISSIONS = {
  PLATFORM_READ: 'platform.read',
  CENTERS_READ: 'centers.read',
  CENTERS_CREATE: 'centers.create',
  CENTERS_UPDATE: 'centers.update',
  /** Freeze, activate, archive. */
  CENTERS_LIFECYCLE: 'centers.lifecycle',
  /** Permanently delete archived centers with all their data (irreversible). */
  CENTERS_DELETE: 'centers.delete',
  DIRECTORS_READ: 'directors.read',
  DIRECTORS_MANAGE: 'directors.manage',
  ANALYTICS_GLOBAL_READ: 'analytics.global.read',
} as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

export const PLATFORM_ROLE_PERMISSIONS: Record<'OWNER', readonly PlatformPermission[]> = {
  OWNER: Object.values(PLATFORM_PERMISSIONS),
};

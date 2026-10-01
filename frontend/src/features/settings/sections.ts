import { Bell, Building2, KeyRound, Languages, MapPin, Palette, SunMoon, Users } from 'lucide-vue-next';
import type { Component } from 'vue';
import { P, type PermissionRequirement } from '@/app/config/permissions';

export interface SettingsSection {
  key: string;
  icon: Component;
  permission?: PermissionRequirement;
  /** Sections with a page of their own (Management menu) link there instead of `/settings/<key>`. */
  to?: string;
}

/** Settings map; routes are `/settings/<key>`. Personal sections need no permission. */
export const settingsSections: readonly SettingsSection[] = [
  { key: 'appearance', icon: SunMoon },
  { key: 'language', icon: Languages },
  { key: 'notifications', icon: Bell, permission: P.NOTIFICATION_PREFERENCES_READ },
  { key: 'brand', icon: Palette },
  { key: 'organization', icon: Building2, permission: P.ORGANIZATION_UPDATE, to: '/center' },
  { key: 'branches', icon: MapPin, permission: P.BRANCH_READ, to: '/branches' },
  { key: 'users', icon: Users, permission: P.USERS_READ },
  { key: 'roles', icon: KeyRound, permission: P.USERS_READ },
];

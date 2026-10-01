import { Building2, ChartPie, History, LayoutDashboard, UserCog, UserRound } from 'lucide-vue-next';
import type { Component } from 'vue';

export interface OwnerNavItem {
  /** i18n key under `owner.nav.` */
  key: string;
  to: string;
  icon: Component;
}

/** The owner's menu (spec order: Dashboard, Centers, Directors, Analytics, Platform, Profile). */
export const ownerNavigation: readonly OwnerNavItem[] = [
  { key: 'dashboard', to: '/owner', icon: LayoutDashboard },
  { key: 'centers', to: '/owner/centers', icon: Building2 },
  { key: 'directors', to: '/owner/directors', icon: UserCog },
  { key: 'analytics', to: '/owner/analytics', icon: ChartPie },
  { key: 'platform', to: '/owner/platform', icon: History },
  { key: 'profile', to: '/owner/profile', icon: UserRound },
];

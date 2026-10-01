import {
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChartPie,
  CheckSquare,
  DoorOpen,
  GraduationCap,
  House,
  LayoutDashboard,
  Magnet,
  MapPin,
  Network,
  Presentation,
  Settings,
  UsersRound,
  Wallet,
} from 'lucide-vue-next';
import type { Component } from 'vue';
import { P, type PermissionRequirement } from './permissions';

export type NavSection = 'main' | 'center' | 'academic' | 'money' | 'sales' | 'team' | 'system';

export interface NavItem {
  /** i18n key under `nav.` and route name. */
  key: string;
  to: string;
  icon: Component;
  section: NavSection;
  /** Any of these permissions shows the item; none → always visible. */
  permission?: PermissionRequirement;
  /** Mobile bottom bar priority (lower first); the 4 best visible ones are shown. */
  primary?: number;
}

/** The single source of the main navigation (sidebar, mobile bar, drawer). Order = order on screen. */
export const navigation: readonly NavItem[] = [
  { key: 'dashboard', to: '/', icon: LayoutDashboard, section: 'main', permission: P.DASHBOARD_READ, primary: 1 },
  { key: 'tasks', to: '/tasks', icon: CheckSquare, section: 'main', permission: [P.TASKS_READ, P.TASKS_READ_OWN], primary: 5 },
  { key: 'notifications', to: '/notifications', icon: Bell, section: 'main', permission: P.NOTIFICATIONS_READ },

  // Center management: the director's tier (staff see only what their permissions allow).
  { key: 'center', to: '/center', icon: Building2, section: 'center', permission: P.ORGANIZATION_UPDATE },
  { key: 'subCenters', to: '/sub-centers', icon: Network, section: 'center', permission: P.SUB_CENTERS_READ },
  { key: 'branches', to: '/branches', icon: MapPin, section: 'center', permission: [P.BRANCH_CREATE, P.BRANCH_UPDATE] },

  { key: 'students', to: '/students', icon: GraduationCap, section: 'academic', permission: [P.STUDENTS_READ, P.STUDENTS_READ_OWN], primary: 4 },
  { key: 'families', to: '/families', icon: House, section: 'academic', permission: P.FAMILIES_READ },
  { key: 'groups', to: '/groups', icon: UsersRound, section: 'academic', permission: [P.GROUPS_READ, P.GROUPS_READ_OWN] },
  { key: 'attendance', to: '/attendance', icon: CalendarCheck, section: 'academic', permission: [P.ATTENDANCE_READ, P.ATTENDANCE_READ_OWN], primary: 3 },
  { key: 'schedule', to: '/schedule', icon: CalendarDays, section: 'academic', permission: [P.GROUPS_READ, P.GROUPS_READ_OWN] },
  { key: 'courses', to: '/courses', icon: BookOpen, section: 'academic', permission: P.COURSES_READ },
  { key: 'teachers', to: '/teachers', icon: Presentation, section: 'academic', permission: P.TEACHERS_READ },
  { key: 'rooms', to: '/rooms', icon: DoorOpen, section: 'academic', permission: P.ROOMS_READ },

  { key: 'finance', to: '/finance', icon: Wallet, section: 'money', permission: P.FINANCE_READ, primary: 2 },

  { key: 'leads', to: '/leads', icon: Magnet, section: 'sales', permission: P.LEADS_READ },

  { key: 'hr', to: '/hr', icon: Briefcase, section: 'team', permission: [P.EMPLOYEES_READ, P.POSITIONS_READ, P.DEPARTMENTS_READ] },

  { key: 'analytics', to: '/analytics', icon: ChartPie, section: 'system', permission: P.ANALYTICS_CENTER_READ },
  {
    key: 'reports',
    to: '/reports',
    icon: BarChart3,
    section: 'system',
    permission: [P.FINANCE_REPORT_READ, P.REPORTS_ACADEMIC_READ, P.LEADS_REPORT_READ],
  },
  { key: 'settings', to: '/settings', icon: Settings, section: 'system' },
];

export const NAV_SECTIONS: readonly NavSection[] = ['main', 'center', 'academic', 'money', 'sales', 'team', 'system'];

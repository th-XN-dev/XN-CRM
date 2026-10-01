import { P } from '@/app/config/permissions';

/**
 * The director permission picker works in modules, not 100+ keys: choosing
 * a module grants every permission of it. Labels: `owner.modules.<key>`.
 * The first matching module wins (e.g. `leads.report.read` → sales).
 */
export const PERMISSION_MODULES = [
  { key: 'center', prefixes: ['organization.', 'branch.', 'sub_centers.'] },
  { key: 'staff', prefixes: ['users.'] },
  { key: 'academic', prefixes: ['families.', 'students.', 'courses.', 'groups.', 'enrollments.', 'teachers.', 'rooms.', 'schedules.'] },
  { key: 'attendance', prefixes: ['attendance.'] },
  { key: 'finance', prefixes: ['finance.'] },
  { key: 'sales', prefixes: ['leads.', 'lead_sources.', 'lead_pipeline.'] },
  { key: 'hr', prefixes: ['employees.', 'employee.', 'positions.', 'departments.'] },
  { key: 'tasks', prefixes: ['tasks.'] },
  { key: 'notifications', prefixes: ['notifications.', 'notification_'] },
  { key: 'reports', prefixes: ['dashboard.', 'reports.', 'analytics.', 'audit.'] },
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number]['key'];

const ALL_KEYS: readonly string[] = Object.values(P);

export function moduleOf(permission: string): PermissionModule | null {
  return PERMISSION_MODULES.find((module) => module.prefixes.some((prefix) => permission.startsWith(prefix)))?.key ?? null;
}

/** Every known permission of the chosen modules. */
export function permissionsOf(modules: readonly string[]): string[] {
  return ALL_KEYS.filter((key) => {
    const module = moduleOf(key);
    return module !== null && modules.includes(module);
  });
}

/** Modules the given permission set touches (for showing a stored custom set). */
export function modulesOf(permissions: readonly string[]): PermissionModule[] {
  const found = new Set(permissions.map(moduleOf).filter((m): m is PermissionModule => m !== null));
  return PERMISSION_MODULES.map((module) => module.key).filter((key) => found.has(key));
}

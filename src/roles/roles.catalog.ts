import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS as P,
  type PermissionKey,
} from '../permissions/permissions.catalog';

const FINANCE_ALL = ALL_PERMISSION_KEYS.filter((key) => key.startsWith('finance.'));
const LEADS_ALL = ALL_PERMISSION_KEYS.filter(
  (key) =>
    key.startsWith('leads.') || key.startsWith('lead_sources.') || key.startsWith('lead_pipeline.'),
);
const HR_ALL = ALL_PERMISSION_KEYS.filter(
  (key) =>
    key.startsWith('employees.') ||
    key.startsWith('employee.') ||
    key.startsWith('positions.') ||
    key.startsWith('departments.'),
);
const TASKS_ALL = ALL_PERMISSION_KEYS.filter((key) => key.startsWith('tasks.'));
/** Every member reads their own notifications and chooses their channels. */
const OWN_NOTIFICATIONS = [
  P.NOTIFICATIONS_READ,
  P.NOTIFICATION_PREFERENCES_READ,
  P.NOTIFICATION_PREFERENCES_UPDATE,
] as const;
/** Every staff member works their own tasks: see, move along and discuss them. */
const OWN_TASKS = [
  P.TASKS_READ_OWN,
  P.TASKS_UPDATE_OWN,
  P.TASKS_COMMENT,
  P.CHECKLISTS_READ_OWN,
] as const;

/**
 * Center-level roles. The management hierarchy is OWNER (platform, see
 * `User.platformRole`) → DIRECTOR (one center) → STAFF (every other role,
 * each a granular permission set limited to assigned branches).
 */
export const SYSTEM_ROLES = {
  DIRECTOR: 'DIRECTOR',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  TEACHER: 'TEACHER',
  HR: 'HR',
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/** Roles a center member may be given through the staff API (DIRECTOR is the owner's call). */
export const STAFF_ROLE_KEYS = Object.values(SYSTEM_ROLES).filter(
  (key): key is Exclude<SystemRoleKey, 'DIRECTOR'> => key !== SYSTEM_ROLES.DIRECTOR,
);

/** Management tier of a center role. */
export const roleTier = (roleKey: string): 'DIRECTOR' | 'STAFF' =>
  roleKey === SYSTEM_ROLES.DIRECTOR ? 'DIRECTOR' : 'STAFF';

interface SystemRoleDefinition {
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
  /**
   * Defaults withdrawn in a later release. The seed removes them from the
   * system role (explicit, reviewable data migration). Never list a key here
   * that is also in `permissions`.
   */
  revoked?: readonly PermissionKey[];
}

/**
 * Default permission sets for system roles. Seeded into the database;
 * after seeding, role ↔ permission links are managed in the database.
 */
export const SYSTEM_ROLE_DEFINITIONS: Record<SystemRoleKey, SystemRoleDefinition> = {
  DIRECTOR: {
    name: 'Director',
    description: 'Runs the center: settings, sub-centers, branches, staff and analytics.',
    permissions: ALL_PERMISSION_KEYS,
  },
  ADMIN: {
    name: 'Administrator',
    description: 'Manages the center on behalf of the director.',
    permissions: ALL_PERMISSION_KEYS,
  },
  MANAGER: {
    name: 'Manager',
    description: 'Runs day-to-day operations of assigned branches.',
    permissions: [
      P.ORGANIZATION_READ,
      P.BRANCH_READ,
      P.SUB_CENTERS_READ,
      P.USERS_READ,
      P.FAMILIES_READ,
      P.FAMILIES_CREATE,
      P.FAMILIES_UPDATE,
      P.FAMILIES_DELETE,
      P.STUDENTS_READ,
      P.STUDENTS_CREATE,
      P.STUDENTS_UPDATE,
      P.STUDENTS_DELETE,
      P.COURSES_READ,
      P.GROUPS_READ,
      P.GROUPS_CREATE,
      P.GROUPS_UPDATE,
      P.GROUPS_DELETE,
      P.ENROLLMENTS_READ,
      P.ENROLLMENTS_CREATE,
      P.ENROLLMENTS_UPDATE,
      P.ENROLLMENTS_TRANSFER,
      P.ENROLLMENTS_CANCEL,
      P.TEACHERS_READ,
      P.TEACHERS_CREATE,
      P.TEACHERS_UPDATE,
      P.TEACHERS_DELETE,
      P.ROOMS_READ,
      P.ROOMS_CREATE,
      P.ROOMS_UPDATE,
      P.ROOMS_DELETE,
      P.SCHEDULES_MANAGE,
      P.ATTENDANCE_READ,
      P.ATTENDANCE_MARK,
      P.ATTENDANCE_MARK_FUTURE,
      P.ATTENDANCE_DELETE,
      ...FINANCE_ALL,
      ...LEADS_ALL,
      // Sees staff of their branches and runs the branch's tasks.
      P.EMPLOYEES_READ,
      P.POSITIONS_READ,
      P.DEPARTMENTS_READ,
      ...TASKS_ALL,
      P.CHECKLISTS_READ_OWN,
      P.CHECKLISTS_READ,
      P.CHECKLISTS_MANAGE,
      P.ANNOUNCEMENTS_SEND,
      P.CONGRATULATIONS_SEND,
      ...OWN_NOTIFICATIONS,
      P.DASHBOARD_READ,
      P.NOTIFICATION_TEMPLATES_READ,
      P.NOTIFICATION_DELIVERY_READ,
      P.DASHBOARD_READ,
      P.REPORTS_ACADEMIC_READ,
    ],
  },
  CASHIER: {
    name: 'Cashier',
    description: 'Handles payments in assigned branches.',
    permissions: [
      P.ORGANIZATION_READ,
      P.BRANCH_READ,
      P.FAMILIES_READ,
      P.STUDENTS_READ,
      P.COURSES_READ,
      P.GROUPS_READ,
      P.ENROLLMENTS_READ,
      P.TEACHERS_READ,
      P.ROOMS_READ,
      P.ATTENDANCE_READ,
      // Takes payments and runs the drawer; expenses/invoices only if granted explicitly.
      P.FINANCE_READ,
      P.FINANCE_PAYMENT_READ,
      P.FINANCE_PAYMENT_CREATE,
      P.FINANCE_CASH_READ,
      P.FINANCE_CASH_OPEN,
      P.FINANCE_CASH_CLOSE,
      ...OWN_TASKS,
      ...OWN_NOTIFICATIONS,
      P.DASHBOARD_READ,
    ],
  },
  TEACHER: {
    name: 'Teacher',
    description: 'Teaches their own groups: sees them, their students and marks attendance.',
    permissions: [
      P.ORGANIZATION_READ,
      P.BRANCH_READ,
      P.COURSES_READ,
      P.ROOMS_READ,
      P.GROUPS_READ_OWN,
      P.STUDENTS_READ_OWN,
      P.ATTENDANCE_READ_OWN,
      P.ATTENDANCE_MARK_OWN,
      // No HR data; only their own tasks.
      ...OWN_TASKS,
      ...OWN_NOTIFICATIONS,
      P.DASHBOARD_READ,
    ],
    // Phase 2 gave teachers branch-wide read access; Phase 3 narrows it to their own groups.
    revoked: [P.GROUPS_READ, P.STUDENTS_READ, P.ENROLLMENTS_READ],
  },
  HR: {
    name: 'HR',
    description: 'Manages staff records.',
    permissions: [
      P.ORGANIZATION_READ,
      P.BRANCH_READ,
      P.USERS_READ,
      P.USERS_CREATE,
      P.USERS_UPDATE,
      P.TEACHERS_READ,
      P.TEACHERS_CREATE,
      P.TEACHERS_UPDATE,
      ...HR_ALL,
      P.CONGRATULATIONS_SEND,
      ...OWN_TASKS,
      ...OWN_NOTIFICATIONS,
      P.DASHBOARD_READ,
    ],
  },
};

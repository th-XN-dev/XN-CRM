/**
 * Business events emitted after a successful commit. Nothing consumes them yet;
 * the future Audit module (and notifications, Telegram, webhooks...) will
 * subscribe with `@OnEvent('**')` / `@OnEvent('enrollment.*')` without touching services.
 */
export const DomainEventName = {
  FAMILY_CREATED: 'family.created',
  STUDENT_CREATED: 'student.created',
  STUDENT_UPDATED: 'student.updated',
  STUDENT_STATUS_CHANGED: 'student.status_changed',
  GROUP_CREATED: 'group.created',
  ENROLLMENT_CREATED: 'enrollment.created',
  ENROLLMENT_TRANSFERRED: 'enrollment.transferred',
  ENROLLMENT_CANCELLED: 'enrollment.cancelled',
  TEACHER_CREATED: 'teacher.created',
  GROUP_TEACHER_ASSIGNED: 'group.teacher_assigned',
  GROUP_ROOM_ASSIGNED: 'group.room_assigned',
  SCHEDULE_CREATED: 'schedule.created',
  SCHEDULE_UPDATED: 'schedule.updated',
  ATTENDANCE_MARKED: 'attendance.marked',
  ATTENDANCE_UPDATED: 'attendance.updated',
  ATTENDANCE_DELETED: 'attendance.deleted',
  INVOICE_CREATED: 'invoice.created',
  INVOICE_UPDATED: 'invoice.updated',
  INVOICE_CANCELLED: 'invoice.cancelled',
  PAYMENT_CREATED: 'payment.created',
  REFUND_CREATED: 'refund.created',
  CASH_SESSION_OPENED: 'cash_session.opened',
  CASH_SESSION_CLOSED: 'cash_session.closed',
  EXPENSE_CREATED: 'expense.created',
  EXPENSE_UPDATED: 'expense.updated',
  LEAD_CREATED: 'lead.created',
  LEAD_UPDATED: 'lead.updated',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  LEAD_ASSIGNED: 'lead.assigned',
  LEAD_FOLLOW_UP_SET: 'lead.follow_up_set',
  LEAD_CONVERTED: 'lead.converted',
  LEAD_LOST: 'lead.lost',
  LEAD_DELETED: 'lead.deleted',
  LEAD_ACTIVITY_CREATED: 'lead_activity.created',
  POSITION_CREATED: 'position.created',
  POSITION_UPDATED: 'position.updated',
  DEPARTMENT_CREATED: 'department.created',
  DEPARTMENT_UPDATED: 'department.updated',
  EMPLOYEE_CREATED: 'employee.created',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_TERMINATED: 'employee.terminated',
  EMPLOYEE_BRANCHES_CHANGED: 'employee.branches_changed',
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_ASSIGNED: 'task.assigned',
  TASK_STATUS_CHANGED: 'task.status_changed',
  TASK_DELETED: 'task.deleted',
  TASK_COMMENTED: 'task.commented',

  // Management hierarchy (platform owner and directors). Audited as CENTER_CREATED, ...
  CENTER_CREATED: 'center.created',
  CENTER_UPDATED: 'center.updated',
  CENTER_FROZEN: 'center.frozen',
  CENTER_ACTIVATED: 'center.activated',
  CENTER_ARCHIVED: 'center.archived',
  BRAND_SETTINGS_CHANGED: 'brand_settings.changed',
  DIRECTOR_CREATED: 'director.created',
  DIRECTOR_PERMISSIONS_CHANGED: 'director.permissions_changed',
  DIRECTOR_STATUS_CHANGED: 'director.status_changed',
  DIRECTOR_PASSWORD_RESET: 'director.password_reset',
  SUB_CENTER_CREATED: 'sub_center.created',
  SUB_CENTER_UPDATED: 'sub_center.updated',
  SUB_CENTER_STATUS_CHANGED: 'sub_center.status_changed',
  BRANCH_CREATED: 'branch.created',
  BRANCH_UPDATED: 'branch.updated',
  STAFF_CREATED: 'staff.created',
  STAFF_UPDATED: 'staff.updated',
  CHECKLIST_CREATED: 'checklist.created',
  CHECKLIST_UPDATED: 'checklist.updated',
  ANNOUNCEMENT_SENT: 'announcement.sent',
  CONGRATULATION_SENT: 'congratulation.sent',
} as const;

export type DomainEventName = (typeof DomainEventName)[keyof typeof DomainEventName];

export interface DomainEvent {
  /** Unique per emitted event; consumers use it as an idempotency key. */
  eventId: string;
  name: DomainEventName;
  organizationId: string;
  /** User who performed the action. */
  actorUserId: string;
  entityType:
    | 'Family'
    | 'Student'
    | 'Group'
    | 'Enrollment'
    | 'Teacher'
    | 'Schedule'
    | 'Attendance'
    | 'Invoice'
    | 'Payment'
    | 'Refund'
    | 'CashSession'
    | 'Expense'
    | 'Lead'
    | 'LeadActivity'
    | 'LeadSource'
    | 'LeadPipeline'
    | 'Position'
    | 'Department'
    | 'Employee'
    | 'Task'
    | 'TaskComment'
    | 'Center'
    | 'SubCenter'
    | 'Branch'
    | 'Membership'
    | 'Checklist'
    | 'Announcement'
    | 'Congratulation';
  entityId: string;
  occurredAt: Date;
  /** Small, JSON-serializable details (e.g. `{ from, to }`). Never secrets. */
  payload: Record<string, unknown>;
  /** The HTTP request that caused the event (absent for background jobs). */
  context?: EventContext;
}

export interface EventContext {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** Branch selected via X-Branch-Id, if any. */
  branchId: string | null;
}

/** Account-level (not organization-scoped) security events. */
export const AccountEventName = {
  REGISTERED: 'account.registered',
  LOGIN: 'account.login',
  LOGOUT: 'account.logout',
  TOKEN_REFRESHED: 'account.token_refreshed',
  /** Reserved for the password change / recovery extension. */
  PASSWORD_CHANGED: 'account.password_changed',
} as const;

export type AccountEventName = (typeof AccountEventName)[keyof typeof AccountEventName];

export interface AccountEvent {
  eventId: string;
  name: AccountEventName;
  userId: string;
  occurredAt: Date;
  context?: EventContext;
}

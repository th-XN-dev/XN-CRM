import type { BadgeTone } from '@/components/ui/AppBadge.vue';

/**
 * Colour of every backend status. Labels live in i18n under `status.<kind>.<VALUE>`.
 * Green = fine, amber = needs attention, red = problem, neutral = finished/inactive.
 */
export const statusTones = {
  student: { ACTIVE: 'success', FROZEN: 'info', GRADUATED: 'brand', LEFT: 'neutral' },
  group: { ACTIVE: 'success', PAUSED: 'warning', COMPLETED: 'brand', CANCELLED: 'neutral' },
  enrollment: { ACTIVE: 'success', COMPLETED: 'brand', TRANSFERRED: 'info', CANCELLED: 'neutral' },
  teacher: { ACTIVE: 'success', INACTIVE: 'neutral' },
  invoice: { PENDING: 'info', PARTIAL: 'warning', PAID: 'success', OVERDUE: 'danger', CANCELLED: 'neutral' },
  cash: { OPEN: 'success', CLOSED: 'neutral' },
  attendance: { PRESENT: 'success', ABSENT: 'danger', LATE: 'warning', EXCUSED: 'info' },
  lead: {
    NEW: 'info',
    CONTACTED: 'brand',
    QUALIFIED: 'brand',
    TRIAL_BOOKED: 'warning',
    TRIAL_ATTENDED: 'warning',
    NEGOTIATION: 'warning',
    CONVERTED: 'success',
    LOST: 'neutral',
  },
  leadPriority: { LOW: 'neutral', MEDIUM: 'info', HIGH: 'danger' },
  task: { TODO: 'neutral', IN_PROGRESS: 'info', BLOCKED: 'danger', COMPLETED: 'success', CANCELLED: 'neutral' },
  taskPriority: { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', URGENT: 'danger' },
  employee: { ACTIVE: 'success', ON_LEAVE: 'warning', INACTIVE: 'neutral', TERMINATED: 'neutral' },
  active: { true: 'success', false: 'neutral' },
  center: { ACTIVE: 'success', FROZEN: 'info', ARCHIVED: 'neutral' },
  availability: { ACTIVE: 'success', FROZEN: 'info', ARCHIVED: 'neutral', EXPIRED: 'danger', NOT_STARTED: 'warning' },
  membership: { ACTIVE: 'success', INVITED: 'info', SUSPENDED: 'neutral' },
} as const satisfies Record<string, Record<string, BadgeTone>>;

export type StatusKind = keyof typeof statusTones;

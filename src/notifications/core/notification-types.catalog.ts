import { NotificationChannel, NotificationPriority, type NotificationType } from '@prisma/client';
import { PERMISSIONS, type PermissionKey } from '../../permissions/permissions.catalog';

const { IN_APP, TELEGRAM } = NotificationChannel;

export interface NotificationTypeDefinition {
  priority: NotificationPriority;
  /** Critical types can't be disabled by an organization, and IN_APP can't be switched off. */
  critical: boolean;
  /** Default policy (an organization may override it via NotificationPolicy). */
  isEnabled: boolean;
  /** Members with this permission (and branch access) receive it besides the event subject. */
  recipientPermission: PermissionKey | null;
  defaultChannels: NotificationChannel[];
  lockedChannels: NotificationChannel[];
  /** The only variables templates of this type may use. */
  variables: readonly string[];
  /** Default text, used when the organization has no template. */
  template: { title: string; message: string };
}

const TASK_VARS = ['taskTitle', 'dueDate', 'priority', 'assignedBy', 'branchName'] as const;
const PAYMENT_VARS = [
  'familyName',
  'studentName',
  'amount',
  'invoiceNumber',
  'dueDate',
  'branchName',
] as const;
const ATTENDANCE_VARS = ['studentName', 'groupName', 'teacherName', 'date', 'branchName'] as const;
const LEAD_VARS = ['leadName', 'leadPhone', 'assignedBy', 'followUpAt', 'branchName'] as const;

/**
 * Single source of truth for notification types: default policy, allowed
 * template variables and default texts. Business rules live here as data —
 * services never special-case a type.
 */
export const NOTIFICATION_TYPES: Record<NotificationType, NotificationTypeDefinition> = {
  TASK_ASSIGNED: {
    priority: NotificationPriority.NORMAL,
    critical: false,
    isEnabled: true,
    recipientPermission: null,
    defaultChannels: [IN_APP, TELEGRAM],
    lockedChannels: [],
    variables: TASK_VARS,
    template: {
      title: 'Yangi vazifa: {{taskTitle}}',
      message: '{{assignedBy}} sizga "{{taskTitle}}" vazifasini berdi. Muddat: {{dueDate}}.',
    },
  },
  TASK_DUE: {
    priority: NotificationPriority.NORMAL,
    critical: false,
    isEnabled: true,
    recipientPermission: null,
    defaultChannels: [IN_APP, TELEGRAM],
    lockedChannels: [],
    variables: TASK_VARS,
    template: {
      title: 'Muddat yaqin: {{taskTitle}}',
      message: '"{{taskTitle}}" vazifasining muddati: {{dueDate}}.',
    },
  },
  TASK_OVERDUE: {
    priority: NotificationPriority.HIGH,
    critical: false,
    isEnabled: true,
    recipientPermission: null,
    defaultChannels: [IN_APP, TELEGRAM],
    lockedChannels: [],
    variables: TASK_VARS,
    template: {
      title: 'Muddati o‘tdi: {{taskTitle}}',
      message: '"{{taskTitle}}" vazifasining muddati {{dueDate}} da tugagan.',
    },
  },
  PAYMENT_RECEIVED: {
    priority: NotificationPriority.NORMAL,
    critical: false,
    isEnabled: true,
    recipientPermission: PERMISSIONS.FINANCE_REPORT_READ,
    defaultChannels: [IN_APP],
    lockedChannels: [],
    variables: [...PAYMENT_VARS, 'paymentMethod', 'cashierName'],
    template: {
      title: 'To‘lov qabul qilindi: {{amount}}',
      message: '{{familyName}} ({{studentName}}) — {{invoiceNumber}} bo‘yicha {{amount}} to‘landi.',
    },
  },
  PAYMENT_DUE: {
    priority: NotificationPriority.NORMAL,
    critical: false,
    isEnabled: true,
    recipientPermission: PERMISSIONS.FINANCE_READ,
    defaultChannels: [IN_APP],
    lockedChannels: [],
    variables: PAYMENT_VARS,
    template: {
      title: 'To‘lov muddati yaqin: {{invoiceNumber}}',
      message: '{{familyName}} ({{studentName}}): {{amount}} qarz, muddat {{dueDate}}.',
    },
  },
  PAYMENT_OVERDUE: {
    priority: NotificationPriority.HIGH,
    critical: false,
    isEnabled: true,
    recipientPermission: PERMISSIONS.FINANCE_READ,
    defaultChannels: [IN_APP],
    lockedChannels: [],
    variables: PAYMENT_VARS,
    template: {
      title: 'To‘lov kechikdi: {{invoiceNumber}}',
      message: '{{familyName}} ({{studentName}}): {{amount}} qarz, muddat {{dueDate}} da o‘tgan.',
    },
  },
  ATTENDANCE_ABSENT: {
    priority: NotificationPriority.NORMAL,
    critical: false,
    isEnabled: true,
    recipientPermission: PERMISSIONS.ATTENDANCE_READ,
    defaultChannels: [IN_APP],
    lockedChannels: [],
    variables: ATTENDANCE_VARS,
    template: {
      title: 'Darsga kelmadi: {{studentName}}',
      message: '{{studentName}} {{date}} kuni {{groupName}} ({{teacherName}}) darsida qatnashmadi.',
    },
  },
  ATTENDANCE_LATE: {
    priority: NotificationPriority.LOW,
    critical: false,
    isEnabled: true,
    recipientPermission: PERMISSIONS.ATTENDANCE_READ,
    defaultChannels: [IN_APP],
    lockedChannels: [],
    variables: ATTENDANCE_VARS,
    template: {
      title: 'Kechikdi: {{studentName}}',
      message: '{{studentName}} {{date}} kuni {{groupName}} ({{teacherName}}) darsiga kechikdi.',
    },
  },
  LEAD_ASSIGNED: {
    priority: NotificationPriority.NORMAL,
    critical: false,
    isEnabled: true,
    recipientPermission: null,
    defaultChannels: [IN_APP, TELEGRAM],
    lockedChannels: [],
    variables: LEAD_VARS,
    template: {
      title: 'Yangi lead: {{leadName}}',
      message: '{{assignedBy}} sizga {{leadName}} ({{leadPhone}}) lead’ini biriktirdi.',
    },
  },
  LEAD_FOLLOW_UP: {
    priority: NotificationPriority.HIGH,
    critical: false,
    isEnabled: true,
    recipientPermission: null,
    defaultChannels: [IN_APP, TELEGRAM],
    lockedChannels: [],
    variables: LEAD_VARS,
    template: {
      title: 'Qayta aloqa vaqti: {{leadName}}',
      message: '{{leadName}} ({{leadPhone}}) bilan bog‘lanish vaqti: {{followUpAt}}.',
    },
  },
  SYSTEM: {
    priority: NotificationPriority.NORMAL,
    critical: true,
    isEnabled: true,
    recipientPermission: null,
    defaultChannels: [IN_APP],
    lockedChannels: [IN_APP],
    variables: ['title', 'message'],
    template: { title: '{{title}}', message: '{{message}}' },
  },
  ANNOUNCEMENT: {
    priority: NotificationPriority.NORMAL,
    critical: true,
    isEnabled: true,
    recipientPermission: null,
    defaultChannels: [IN_APP, TELEGRAM],
    lockedChannels: [IN_APP],
    variables: ['title', 'message', 'senderName', 'senderId'],
    template: { title: '{{title}}', message: '{{message}}' },
  },
  CONGRATULATION: {
    priority: NotificationPriority.NORMAL,
    critical: false,
    isEnabled: true,
    recipientPermission: null,
    defaultChannels: [IN_APP, TELEGRAM],
    lockedChannels: [],
    variables: ['title', 'message', 'senderName', 'senderId', 'occasion'],
    template: { title: '{{title}}', message: '{{message}}' },
  },
};

export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

/** Preference column for each channel. */
export const CHANNEL_PREFERENCE_FIELD = {
  IN_APP: 'inAppEnabled',
  TELEGRAM: 'telegramEnabled',
  EMAIL: 'emailEnabled',
  SMS: 'smsEnabled',
  PUSH: 'pushEnabled',
} as const satisfies Record<NotificationChannel, string>;

export type PreferenceField = (typeof CHANNEL_PREFERENCE_FIELD)[NotificationChannel];

export const ALL_CHANNELS = Object.keys(CHANNEL_PREFERENCE_FIELD) as NotificationChannel[];

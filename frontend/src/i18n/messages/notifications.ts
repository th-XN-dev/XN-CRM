import { defineMessages } from '../define';

const types = {
  en: { TASK_ASSIGNED: 'Task assigned', TASK_DUE: 'Task due', TASK_OVERDUE: 'Task overdue', PAYMENT_RECEIVED: 'Payment received', PAYMENT_DUE: 'Payment due', PAYMENT_OVERDUE: 'Payment overdue', ATTENDANCE_ABSENT: 'Student absent', ATTENDANCE_LATE: 'Student late', LEAD_ASSIGNED: 'Lead assigned', LEAD_FOLLOW_UP: 'Lead follow-up', SYSTEM: 'Announcement' },
  uz: { TASK_ASSIGNED: 'Vazifa berildi', TASK_DUE: 'Vazifa muddati', TASK_OVERDUE: 'Vazifa muddati o‘tdi', PAYMENT_RECEIVED: 'To‘lov qabul qilindi', PAYMENT_DUE: 'To‘lov muddati', PAYMENT_OVERDUE: 'To‘lov muddati o‘tdi', ATTENDANCE_ABSENT: 'Talaba kelmadi', ATTENDANCE_LATE: 'Talaba kechikdi', LEAD_ASSIGNED: 'Lid biriktirildi', LEAD_FOLLOW_UP: 'Lid bilan bog‘lanish', SYSTEM: 'E’lon' },
  ru: { TASK_ASSIGNED: 'Назначена задача', TASK_DUE: 'Срок задачи', TASK_OVERDUE: 'Задача просрочена', PAYMENT_RECEIVED: 'Оплата получена', PAYMENT_DUE: 'Срок оплаты', PAYMENT_OVERDUE: 'Оплата просрочена', ATTENDANCE_ABSENT: 'Ученик отсутствовал', ATTENDANCE_LATE: 'Ученик опоздал', LEAD_ASSIGNED: 'Назначен лид', LEAD_FOLLOW_UP: 'Связаться с лидом', SYSTEM: 'Объявление' },
};

export default defineMessages({
  en: {
    subtitle: 'What happened that concerns you',
    unread: 'Unread',
    show: 'Show',
    type: 'Type',
    markRead: 'Mark as read',
    markAll: 'Mark all as read',
    allCaughtUp: 'All caught up',
    allCaughtUpText: 'New notifications will appear here.',
    empty: 'No notifications',
    types: types.en,
  },
  uz: {
    subtitle: 'Sizga tegishli voqealar',
    unread: 'O‘qilmagan',
    show: 'Ko‘rsatish',
    type: 'Turi',
    markRead: 'O‘qilgan deb belgilash',
    markAll: 'Hammasini o‘qilgan deb belgilash',
    allCaughtUp: 'Hammasi o‘qilgan',
    allCaughtUpText: 'Yangi bildirishnomalar shu yerda paydo bo‘ladi.',
    empty: 'Bildirishnomalar yo‘q',
    types: types.uz,
  },
  ru: {
    subtitle: 'Что произошло и касается вас',
    unread: 'Непрочитанные',
    show: 'Показать',
    type: 'Тип',
    markRead: 'Отметить прочитанным',
    markAll: 'Прочитать все',
    allCaughtUp: 'Всё прочитано',
    allCaughtUpText: 'Новые уведомления появятся здесь.',
    empty: 'Уведомлений нет',
    types: types.ru,
  },
});

import type { RouteLocationRaw } from 'vue-router';
import type { NotificationResponseDto } from '@/services/api/schema.gen';

/** The record a notification is about (payments open their invoice); null = nothing to open. */
export function notificationTarget(n: NotificationResponseDto): RouteLocationRaw | null {
  const id = n.relatedId;
  if (!id) return null;
  switch (n.relatedType) {
    case 'Task':
      return { name: 'task', params: { id } };
    case 'Lead':
      return { name: 'lead', params: { id } };
    case 'Student':
      return { name: 'student', params: { id } };
    case 'Invoice':
      return { name: 'invoice', params: { id } };
    case 'Payment': {
      const invoiceId = typeof n.data.invoiceId === 'string' ? n.data.invoiceId : null;
      return invoiceId ? { name: 'invoice', params: { id: invoiceId } } : { name: 'finance-payments' };
    }
    default:
      return null;
  }
}

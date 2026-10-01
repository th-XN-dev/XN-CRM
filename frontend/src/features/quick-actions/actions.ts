import { CalendarCheck, CheckSquare, FilePlus2, GraduationCap, HandCoins, House, Magnet } from 'lucide-vue-next';
import { defineStore } from 'pinia';
import { ref, type Component } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import { P, type PermissionRequirement } from '@/app/config/permissions';

/** A dialog the shell can open from anywhere (search palette, "+" menu). */
export type QuickDialog = 'student' | 'family' | 'invoice' | 'payment' | 'lead' | 'task';

export interface QuickAction {
  key: string;
  icon: Component;
  permission: PermissionRequirement;
  /** Opens a dialog in place, or navigates. */
  dialog?: QuickDialog;
  to?: RouteLocationRaw;
}

/** The everyday "create / do" shortcuts, in order of how often staff need them. */
export const quickActions: readonly QuickAction[] = [
  { key: 'payment', icon: HandCoins, permission: P.FINANCE_PAYMENT_CREATE, dialog: 'payment' },
  { key: 'student', icon: GraduationCap, permission: P.STUDENTS_CREATE, dialog: 'student' },
  { key: 'attendance', icon: CalendarCheck, permission: [P.ATTENDANCE_MARK, P.ATTENDANCE_MARK_OWN], to: { name: 'attendance' } },
  { key: 'lead', icon: Magnet, permission: P.LEADS_CREATE, dialog: 'lead' },
  { key: 'invoice', icon: FilePlus2, permission: P.FINANCE_INVOICE_CREATE, dialog: 'invoice' },
  { key: 'family', icon: House, permission: P.FAMILIES_CREATE, dialog: 'family' },
  { key: 'task', icon: CheckSquare, permission: P.TASKS_CREATE, dialog: 'task' },
];

/** Which quick dialog is open (one at a time). */
export const useQuickActionsStore = defineStore('quick-actions', () => {
  const dialog = ref<QuickDialog | null>(null);
  return { dialog, open: (value: QuickDialog) => (dialog.value = value), close: () => (dialog.value = null) };
});

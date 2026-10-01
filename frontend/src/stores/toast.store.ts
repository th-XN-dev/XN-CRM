import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const DURATION_MS = 4_000;

/** Short, non-blocking feedback after an action ("Saved"). */
export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);
  let nextId = 1;

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function show(message: string, tone: ToastTone = 'success'): void {
    const id = nextId++;
    toasts.value = [...toasts.value.slice(-2), { id, tone, message }];
    // Problems stay longer: they usually need reading, not a glance.
    window.setTimeout(() => dismiss(id), tone === 'error' || tone === 'warning' ? DURATION_MS * 2 : DURATION_MS);
  }

  return {
    toasts,
    dismiss,
    success: (message: string) => show(message, 'success'),
    error: (message: string) => show(message, 'error'),
    warning: (message: string) => show(message, 'warning'),
    info: (message: string) => show(message, 'info'),
  };
});

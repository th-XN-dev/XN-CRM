import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** Destructive actions get a red confirm button. */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/** Backs the single <ConfirmDialog> mounted in App.vue. */
export const useConfirmStore = defineStore('confirm', () => {
  const pending = ref<PendingConfirm | null>(null);

  function settle(confirmed: boolean): void {
    pending.value?.resolve(confirmed);
    pending.value = null;
  }

  return { pending, settle };
});

/**
 * `if (await confirm({ title, danger: true })) …` — only for actions that are
 * destructive or hard to undo; everything else just happens.
 */
export function useConfirm() {
  const store = useConfirmStore();
  return (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      store.pending?.resolve(false);
      store.pending = { ...options, resolve };
    });
}

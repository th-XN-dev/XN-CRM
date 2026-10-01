<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { ref, useId, watch } from 'vue';

/**
 * Native <dialog>: focus trap, Esc, inert background and top layer come from
 * the browser. `v-model:open` controls it; focus returns to the opener.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    size?: 'sm' | 'md' | 'lg';
    dismissible?: boolean;
    /** Forms: the whole screen on phones (room for the keyboard), centred from `sm` up. */
    fullscreenMobile?: boolean;
    /** Asked before a user-initiated close (X, Esc, backdrop); `false` keeps the dialog open. */
    beforeClose?: () => boolean | Promise<boolean>;
  }>(),
  { size: 'md', dismissible: true },
);
const open = defineModel<boolean>('open', { default: false });
const dialog = ref<HTMLDialogElement>();
const titleId = useId();
const descriptionId = useId();
let opener: HTMLElement | null = null;

watch(
  open,
  (value) => {
    const el = dialog.value;
    if (!el) return;
    if (value && !el.open) {
      opener = document.activeElement as HTMLElement | null;
      el.showModal();
    } else if (!value && el.open) {
      el.close();
    }
  },
  { flush: 'post' },
);

function onClose(): void {
  open.value = false;
  opener?.focus();
}

/** Every user-initiated close goes through here (the guard may veto it). */
async function requestClose(): Promise<void> {
  if (!props.dismissible) return;
  if (props.beforeClose && !(await props.beforeClose())) return;
  open.value = false;
}

function onCancel(event: Event): void {
  // Esc: the native dialog would close itself; route it through the guard instead.
  event.preventDefault();
  void requestClose();
}

function onBackdrop(event: MouseEvent): void {
  if (event.target === dialog.value) void requestClose();
}

defineExpose({ requestClose });

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    :aria-describedby="description ? descriptionId : undefined"
    class="glass-strong m-0 mt-auto w-full max-w-none rounded-t-3xl p-0 text-fg backdrop:bg-overlay sm:m-auto sm:rounded-3xl"
    :class="[widths[size], fullscreenMobile && 'max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none']"
    @close="onClose"
    @cancel="onCancel"
    @click="onBackdrop"
  >
    <div v-if="open" class="flex flex-col" :class="fullscreenMobile ? 'h-full sm:max-h-[85dvh]' : 'max-h-[85dvh]'">
      <div class="flex items-start gap-4 px-5 pt-5 pb-2 sm:px-6 sm:pt-6">
        <div class="min-w-0 flex-1">
          <h2 :id="titleId" class="text-lg font-semibold">{{ title }}</h2>
          <p v-if="description" :id="descriptionId" class="mt-1 text-sm text-fg-muted">{{ description }}</p>
        </div>
        <button
          v-if="dismissible"
          type="button"
          class="focus-ring -mt-1 -mr-2 inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-hover"
          :aria-label="$t('common.close')"
          @click="requestClose"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-5 py-3 sm:px-6"><slot /></div>
      <div
        v-if="$slots.footer"
        class="flex flex-col-reverse gap-2 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-6"
      >
        <slot name="footer" />
      </div>
    </div>
  </dialog>
</template>

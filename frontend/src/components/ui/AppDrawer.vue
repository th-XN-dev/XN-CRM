<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { ref, useId, watch } from 'vue';

/** Side sheet (native <dialog>): mobile navigation, filters, secondary panels. */
withDefaults(defineProps<{ title: string; side?: 'left' | 'right'; hideTitle?: boolean }>(), {
  side: 'left',
});
const open = defineModel<boolean>('open', { default: false });
const dialog = ref<HTMLDialogElement>();
const titleId = useId();

watch(
  open,
  (value) => {
    const el = dialog.value;
    if (!el) return;
    if (value && !el.open) el.showModal();
    else if (!value && el.open) el.close();
  },
  { flush: 'post' },
);

function onBackdrop(event: MouseEvent): void {
  if (event.target === dialog.value) open.value = false;
}
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    class="glass-strong m-0 h-dvh max-h-none w-[min(22rem,88vw)] max-w-none rounded-none border-y-0 p-0 text-fg"
    :class="side === 'left' ? 'mr-auto rounded-r-3xl border-l-0' : 'ml-auto rounded-l-3xl border-r-0'"
    @close="open = false"
    @click="onBackdrop"
  >
    <div v-if="open" class="flex h-full flex-col pt-[env(safe-area-inset-top)]">
      <div class="flex items-center gap-3 px-4 py-3">
        <h2 :id="titleId" class="min-w-0 flex-1 truncate text-base font-semibold" :class="hideTitle && 'sr-only'">
          {{ title }}
        </h2>
        <slot name="header" />
        <button
          type="button"
          class="focus-ring inline-flex size-11 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-hover"
          :aria-label="$t('common.close')"
          @click="open = false"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"><slot /></div>
    </div>
  </dialog>
</template>

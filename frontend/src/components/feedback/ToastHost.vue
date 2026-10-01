<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-vue-next';
import { useToastStore } from '@/stores/toast.store';

const toasts = useToastStore();
const icons = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info };
const tones = { success: 'text-success', error: 'text-danger', warning: 'text-warning', info: 'text-info' };
</script>

<template>
  <div
    aria-live="polite"
    class="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-60 flex flex-col items-center gap-2 px-4 lg:top-4 lg:right-4 lg:bottom-auto lg:left-auto lg:items-end"
  >
    <TransitionGroup
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in toasts.toasts"
        :key="toast.id"
        :role="toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : 'status'"
        class="glass-strong pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 text-sm text-fg"
      >
        <component :is="icons[toast.tone]" class="size-5 shrink-0" :class="tones[toast.tone]" aria-hidden="true" />
        <p class="min-w-0 flex-1">{{ toast.message }}</p>
        <button
          type="button"
          class="focus-ring -mr-1 inline-flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover"
          :aria-label="$t('toast.dismiss')"
          @click="toasts.dismiss(toast.id)"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

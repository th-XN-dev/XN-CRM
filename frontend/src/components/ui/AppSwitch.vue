<script setup lang="ts">
defineProps<{ id?: string; label: string; disabled?: boolean; hideLabel?: boolean }>();
const model = defineModel<boolean>({ default: false });
</script>

<template>
  <button
    :id="id"
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="hideLabel ? label : undefined"
    :disabled="disabled"
    class="focus-ring group inline-flex min-h-11 items-center gap-3 rounded-full text-sm text-fg disabled:opacity-50 sm:min-h-0"
    @click="model = !model"
  >
    <span
      class="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors"
      :class="model ? 'bg-primary' : 'bg-border-strong'"
    >
      <span
        class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform"
        :class="model && 'translate-x-5'"
      />
    </span>
    <span v-if="!hideLabel">{{ label }}</span>
  </button>
</template>

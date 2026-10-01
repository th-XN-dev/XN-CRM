<script setup lang="ts">
/**
 * Calendar date "YYYY-MM-DD" (the API format). Uses the native date input:
 * the platform picker on phones, full keyboard support, localized display.
 */
defineOptions({ inheritAttrs: false });
defineProps<{ id?: string; min?: string; max?: string; invalid?: boolean; describedBy?: string }>();
const model = defineModel<string>({ default: '' });
</script>

<template>
  <input
    :id="id"
    v-model="model"
    v-bind="$attrs"
    type="date"
    :min="min"
    :max="max"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    class="h-11 w-full rounded-xl border bg-surface px-3.5 text-base text-fg shadow-sm focus:border-primary focus:ring-4 focus:ring-ring focus:outline-none sm:h-10 sm:text-sm"
    :class="invalid ? 'border-danger' : 'border-border-strong'"
  />
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineOptions({ inheritAttrs: false });
defineProps<{
  id?: string;
  type?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  icon?: Component;
  describedBy?: string;
}>();
const model = defineModel<string>({ default: '' });
</script>

<template>
  <div class="relative flex items-center">
    <component
      :is="icon"
      v-if="icon"
      class="pointer-events-none absolute left-3 size-4.5 text-fg-subtle"
      aria-hidden="true"
    />
    <input
      :id="id"
      v-model="model"
      v-bind="$attrs"
      :type="type ?? 'text'"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      class="h-11 w-full rounded-xl border bg-surface px-3.5 text-base text-fg shadow-sm transition-colors placeholder:text-fg-subtle focus:border-primary focus:ring-4 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 sm:h-10 sm:text-sm"
      :class="[
        invalid ? 'border-danger focus:border-danger' : 'border-border-strong',
        icon && 'pl-10',
        $slots.trailing && 'pr-11',
      ]"
    />
    <div v-if="$slots.trailing" class="absolute right-1.5 flex items-center">
      <slot name="trailing" />
    </div>
  </div>
</template>

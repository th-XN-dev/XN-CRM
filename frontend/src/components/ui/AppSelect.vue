<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

defineOptions({ inheritAttrs: false });
defineProps<{
  id?: string;
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}>();
const model = defineModel<string>({ default: '' });
</script>

<template>
  <!-- Native select: best keyboard, screen-reader and mobile picker support. -->
  <div class="relative">
    <select
      :id="id"
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      class="h-11 w-full appearance-none rounded-xl border bg-surface pr-10 pl-3.5 text-base text-fg shadow-sm focus:border-primary focus:ring-4 focus:ring-ring focus:outline-none sm:h-10 sm:text-sm"
      :class="invalid ? 'border-danger' : 'border-border-strong'"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled">
        {{ option.label }}
      </option>
    </select>
    <ChevronDown class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
  </div>
</template>

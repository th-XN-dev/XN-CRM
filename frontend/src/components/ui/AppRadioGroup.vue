<script setup lang="ts" generic="T extends string">
/**
 * Choice among a few options with an explanation each (status changes,
 * plans). Native radios: arrow keys move, Space selects, screen readers
 * announce "1 of 4".
 */
export interface RadioOption<V extends string = string> {
  value: V;
  label: string;
  description?: string;
  disabled?: boolean;
}

defineProps<{ options: readonly RadioOption<T>[]; label: string; name: string }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <fieldset class="flex flex-col gap-2">
    <legend class="sr-only">{{ label }}</legend>
    <label
      v-for="option in options"
      :key="option.value"
      class="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
    >
      <input v-model="model" type="radio" :name="name" :value="option.value" :disabled="option.disabled" class="mt-1 size-4 accent-[var(--primary)]" />
      <span class="min-w-0">
        <span class="block text-sm font-medium text-fg">{{ option.label }}</span>
        <span v-if="option.description" class="block text-sm text-fg-muted">{{ option.description }}</span>
      </span>
    </label>
  </fieldset>
</template>

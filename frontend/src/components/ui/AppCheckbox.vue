<script setup lang="ts">
defineProps<{ id?: string; label?: string; disabled?: boolean }>();
const model = defineModel<boolean>({ default: false });
</script>

<template>
  <label class="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg sm:min-h-0">
    <input
      :id="id"
      v-model="model"
      type="checkbox"
      :disabled="disabled"
      class="size-5 rounded-md border-border-strong accent-(--primary) focus-visible:ring-4 focus-visible:ring-ring"
    />
    <slot>{{ label }}</slot>
  </label>
</template>

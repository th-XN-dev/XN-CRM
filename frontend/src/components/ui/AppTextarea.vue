<script setup lang="ts">
defineOptions({ inheritAttrs: false });
defineProps<{ id?: string; rows?: number; invalid?: boolean; describedBy?: string; placeholder?: string }>();
const model = defineModel<string>({ default: '' });
</script>

<template>
  <textarea
    :id="id"
    v-model="model"
    v-bind="$attrs"
    :rows="rows ?? 4"
    :placeholder="placeholder"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy"
    class="w-full rounded-xl border bg-surface px-3.5 py-2.5 text-base text-fg shadow-sm placeholder:text-fg-subtle focus:border-primary focus:ring-4 focus:ring-ring focus:outline-none sm:text-sm"
    :class="invalid ? 'border-danger' : 'border-border-strong'"
  />
</template>

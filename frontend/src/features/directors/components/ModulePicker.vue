<script setup lang="ts">
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import { PERMISSION_MODULES } from '../permission-modules';

/** Checkboxes for permission modules (v-model = chosen module keys). */
const model = defineModel<string[]>({ default: () => [] });

function toggle(key: string, on: boolean): void {
  model.value = on ? [...new Set([...model.value, key])] : model.value.filter((k) => k !== key);
}
</script>

<template>
  <ul class="grid gap-2 sm:grid-cols-2">
    <li v-for="module in PERMISSION_MODULES" :key="module.key" class="rounded-xl border border-border px-3 py-2">
      <AppCheckbox :model-value="model.includes(module.key)" :label="$t(`owner.modules.${module.key}`)" @update:model-value="toggle(module.key, $event)" />
    </li>
  </ul>
</template>

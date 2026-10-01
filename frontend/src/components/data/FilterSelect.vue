<script setup lang="ts">
import { useId } from 'vue';
import AppSelect, { type SelectOption } from '@/components/ui/AppSelect.vue';

/** A labelled filter: "All" plus the options. Empty string = no filter. */
defineProps<{ label: string; options: readonly SelectOption[]; allLabel?: string }>();
const model = defineModel<string>({ default: '' });
const id = useId();
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-xs font-medium text-fg-muted">{{ label }}</label>
    <AppSelect :id="id" v-model="model" :options="[{ value: '', label: allLabel ?? $t('common.all') }, ...options]" />
  </div>
</template>

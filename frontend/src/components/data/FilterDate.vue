<script setup lang="ts">
import { useId } from 'vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';

defineProps<{ label: string; min?: string; max?: string }>();
const model = defineModel<string>({ default: '' });
const id = useId();
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-xs font-medium text-fg-muted">{{ label }}</label>
    <AppDatePicker :id="id" v-model="model" :min="min" :max="max" />
  </div>
</template>

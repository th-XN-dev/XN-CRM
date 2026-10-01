<script setup lang="ts">
import AppAlert from '@/components/ui/AppAlert.vue';

/** Form-level error (e.g. wrong password) shown above the submit button. */
defineProps<{ message?: string | null }>();
</script>

<template>
  <AppAlert v-if="message" tone="danger">{{ message }}</AppAlert>
</template>

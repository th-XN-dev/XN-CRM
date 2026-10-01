<script setup lang="ts">
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue';
import ToastHost from '@/components/feedback/ToastHost.vue';
import { useBrand } from '@/composables/useBrand';
import { useTheme } from '@/composables/useTheme';

useTheme();
useBrand();
</script>

<template>
  <RouterView />
  <ToastHost />
  <ConfirmDialog />
</template>

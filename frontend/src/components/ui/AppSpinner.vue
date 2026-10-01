<script setup lang="ts">
defineProps<{ size?: 'sm' | 'md' | 'lg'; label?: string }>();
</script>

<template>
  <span role="status" class="inline-flex items-center">
    <svg
      class="animate-spin"
      :class="{ 'size-4': size === 'sm', 'size-5': !size || size === 'md', 'size-8': size === 'lg' }"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.2" stroke-width="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
    <span class="sr-only">{{ label ?? $t('common.loading') }}</span>
  </span>
</template>

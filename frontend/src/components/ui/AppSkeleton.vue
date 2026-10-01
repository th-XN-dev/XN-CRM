<script setup lang="ts">
/** A placeholder shape while content loads; decorative, hidden from screen readers. */
withDefaults(defineProps<{ shape?: 'line' | 'block' | 'circle' }>(), { shape: 'line' });
</script>

<template>
  <span
    aria-hidden="true"
    class="block animate-pulse bg-surface-muted motion-reduce:animate-none"
    :class="{ 'h-3.5 rounded': shape === 'line', 'rounded-2xl': shape === 'block', 'rounded-full': shape === 'circle' }"
  />
</template>

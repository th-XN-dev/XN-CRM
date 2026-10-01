<script setup lang="ts">
/** Solid content surface (content stays readable; glass is for chrome). */
withDefaults(defineProps<{ as?: string; padded?: boolean }>(), { as: 'section', padded: true });
</script>

<template>
  <component
    :is="as"
    class="rounded-2xl border border-border bg-surface shadow-card"
    :class="padded && 'p-4 sm:p-6'"
  >
    <slot />
  </component>
</template>

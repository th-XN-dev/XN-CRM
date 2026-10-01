<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(defineProps<{ name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
});
const failed = ref(false);
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join(''),
);
const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg' };
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    :alt="name"
    loading="lazy"
    decoding="async"
    class="shrink-0 rounded-full object-cover"
    :class="sizes[size]"
    @error="failed = true"
  />
  <span
    v-else
    class="inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-soft-fg"
    :class="sizes[size]"
    role="img"
    :aria-label="name"
  >
    {{ initials }}
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

/** Organization logo, or its initials on the brand color when there is none. */
const props = withDefaults(defineProps<{ name: string; logoUrl?: string | null; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
});
const failed = ref(false);
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join(''),
);
const sizes = { sm: 'size-8 text-[0.65rem]', md: 'size-10 text-xs', lg: 'size-14 text-base' };
</script>

<template>
  <img
    v-if="logoUrl && !failed"
    :src="logoUrl"
    :alt="name"
    class="shrink-0 rounded-xl object-contain"
    :class="sizes[size]"
    decoding="async"
    @error="failed = true"
  />
  <span
    v-else
    class="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary font-bold tracking-wide text-primary-fg shadow-sm"
    :class="sizes[size]"
    aria-hidden="true"
  >
    {{ initials }}
  </span>
</template>

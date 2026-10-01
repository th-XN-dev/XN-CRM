<script setup lang="ts">
import { computed } from 'vue';
import { isHexColor, readableOn } from '@/lib/color';

/** An organization's initials on its own brand color (selector lists). */
const props = defineProps<{ name: string; color: string; logoUrl?: string | null }>();
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join(''),
);
const style = computed(() =>
  isHexColor(props.color) ? { backgroundColor: props.color, color: readableOn(props.color) } : undefined,
);
</script>

<template>
  <img v-if="logoUrl" :src="logoUrl" :alt="name" class="size-11 shrink-0 rounded-xl object-contain" decoding="async" />
  <span
    v-else
    class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-fg"
    :style="style"
    aria-hidden="true"
  >
    {{ initials }}
  </span>
</template>

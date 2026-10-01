<script setup lang="ts">
import { computed } from 'vue';
import { statusTones, type StatusKind } from '@/app/config/statuses';
import AppBadge from '@/components/ui/AppBadge.vue';
import type { BadgeTone } from '@/components/ui/AppBadge.vue';

/** A backend status as a coloured, translated badge. */
const props = defineProps<{ kind: StatusKind; value: string | boolean }>();
const key = computed(() => String(props.value));
const tone = computed<BadgeTone>(
  () => (statusTones[props.kind] as Record<string, BadgeTone>)[key.value] ?? 'neutral',
);
</script>

<template>
  <AppBadge :tone="tone" dot>{{ $t(`status.${kind}.${key}`) }}</AppBadge>
</template>

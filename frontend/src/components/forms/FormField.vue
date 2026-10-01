<script setup lang="ts">
import { computed, useId } from 'vue';

/**
 * Label + control + hint/error, wired for screen readers. The control gets
 * `id`, `describedBy` and `invalid` through the default slot.
 */
const props = defineProps<{ label: string; error?: string; hint?: string; optional?: boolean; hideLabel?: boolean }>();
const id = useId();
const messageId = `${id}-message`;
const describedBy = computed(() => (props.error || props.hint ? messageId : undefined));
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-medium text-fg" :class="hideLabel && 'sr-only'">
      {{ label }}
      <span v-if="optional" class="font-normal text-fg-subtle">({{ $t('common.optional') }})</span>
    </label>
    <slot :id="id" :described-by="describedBy" :invalid="!!error" />
    <p v-if="error" :id="messageId" class="text-sm text-danger">{{ error }}</p>
    <p v-else-if="hint" :id="messageId" class="text-sm text-fg-muted">{{ hint }}</p>
  </div>
</template>

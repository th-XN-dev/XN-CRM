<script setup lang="ts">
import { computed } from 'vue';
import { useFormatters } from '@/composables/useFormatters';

/**
 * Whole-sum amount field: digits only, shown grouped ("1 250 000") with the
 * organization's currency. The model is the plain digit string ("1250000").
 */
defineOptions({ inheritAttrs: false });
defineProps<{ id?: string; invalid?: boolean; describedBy?: string; disabled?: boolean; placeholder?: string }>();
const model = defineModel<string>({ default: '' });
const format = useFormatters();

const display = computed(() => model.value.replace(/\B(?=(\d{3})+(?!\d))/g, ' '));

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  const digits = target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 13);
  model.value = digits;
  target.value = display.value; // keep the grouping while typing
}
</script>

<template>
  <div class="relative flex items-center">
    <input
      :id="id"
      v-bind="$attrs"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :value="display"
      :disabled="disabled"
      :placeholder="placeholder ?? '0'"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      class="h-11 w-full rounded-xl border bg-surface pr-16 pl-3.5 text-base text-fg tabular-nums shadow-sm placeholder:text-fg-subtle focus:border-primary focus:ring-4 focus:ring-ring focus:outline-none disabled:bg-surface-muted sm:h-10 sm:text-sm"
      :class="invalid ? 'border-danger' : 'border-border-strong'"
      @input="onInput"
    />
    <span class="pointer-events-none absolute right-3.5 text-sm text-fg-subtle">{{ format.currency() }}</span>
  </div>
</template>

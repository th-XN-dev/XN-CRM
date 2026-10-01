<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core';
import { SlidersHorizontal } from 'lucide-vue-next';
import { ref } from 'vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import SearchInput from '@/components/ui/SearchInput.vue';

/**
 * Search + filters for every large list. Desktop: filters inline next to the
 * search. Phone: a "Filters (n)" button opens them in a drawer. The filter
 * fields are rendered once (the `filters` slot), in whichever place applies.
 */
defineProps<{ searchLabel?: string; activeFilters?: number }>();
const search = defineModel<string>('search', { default: '' });
const emit = defineEmits<{ reset: [] }>();
const desktop = useMediaQuery('(min-width: 768px)');
const open = ref(false);

function reset(): void {
  emit('reset');
  open.value = false;
}
</script>

<template>
  <div class="mb-4 flex flex-col gap-3">
    <div class="flex flex-col gap-3 md:flex-row md:items-center">
      <div v-if="searchLabel" class="flex gap-2 md:w-80 md:shrink-0">
        <div class="min-w-0 flex-1"><SearchInput v-model="search" :label="searchLabel" /></div>
        <AppButton
          v-if="$slots.filters && !desktop"
          variant="secondary"
          :icon="SlidersHorizontal"
          :aria-label="$t('common.filters')"
          @click="open = true"
        >
          <span class="sr-only sm:not-sr-only">{{ $t('common.filters') }}</span>
          <span v-if="activeFilters" class="inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-fg">{{ activeFilters }}</span>
        </AppButton>
      </div>
      <AppButton v-else-if="$slots.filters && !desktop" variant="secondary" :icon="SlidersHorizontal" class="self-start" @click="open = true">
        {{ $t('common.filters') }}
        <span v-if="activeFilters" class="inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-fg">{{ activeFilters }}</span>
      </AppButton>
      <!-- Desktop without search: the filters share the first row. -->
      <div v-if="$slots.filters && desktop && !searchLabel" class="flex flex-1 flex-wrap items-end gap-3 [&>*]:w-44 [&>*]:shrink-0">
        <slot name="filters" />
        <AppButton v-if="activeFilters" variant="ghost" class="!w-auto" @click="reset">{{ $t('common.resetFilters') }}</AppButton>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap gap-2 md:ml-auto"><slot name="actions" /></div>
    </div>

    <div v-if="$slots.filters && desktop && searchLabel" class="flex flex-wrap items-end gap-3 [&>*]:w-44 [&>*]:shrink-0">
      <slot name="filters" />
      <AppButton v-if="activeFilters" variant="ghost" class="!w-auto" @click="reset">{{ $t('common.resetFilters') }}</AppButton>
    </div>

    <AppDrawer v-if="!desktop && $slots.filters" v-model:open="open" :title="$t('common.filters')" side="right">
      <div class="flex flex-col gap-4 px-1 py-2">
        <slot name="filters" />
        <div class="mt-2 flex gap-2">
          <AppButton variant="secondary" block @click="reset">{{ $t('common.resetFilters') }}</AppButton>
          <AppButton block @click="open = false">{{ $t('common.showResults') }}</AppButton>
        </div>
      </div>
    </AppDrawer>
  </div>
</template>

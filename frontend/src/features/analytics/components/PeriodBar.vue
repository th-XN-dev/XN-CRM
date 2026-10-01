<script setup lang="ts">
import FilterDate from '@/components/data/FilterDate.vue';
import AppTabs from '@/components/ui/AppTabs.vue';
import type { PeriodFilter } from '../usePeriodFilter';

/** Period tabs, plus the two dates when "Dates" is chosen; extra filters go in the slot. */
const props = defineProps<{ filter: PeriodFilter; label: string }>();
const { list, periods, periodModel } = props.filter;
</script>

<template>
  <div class="mb-5 flex flex-col gap-3">
    <div class="-mx-1 overflow-x-auto px-1">
      <AppTabs v-model="periodModel" :tabs="periods" :label="label" />
    </div>
    <div v-if="list.state.period === 'custom' || $slots.default" class="flex flex-wrap items-end gap-3 [&>*]:w-full sm:[&>*]:w-48">
      <template v-if="list.state.period === 'custom'">
        <FilterDate :model-value="list.state.from" :label="$t('common.from')" :max="list.state.to || undefined" @update:model-value="list.set({ from: $event })" />
        <FilterDate :model-value="list.state.to" :label="$t('common.to')" :min="list.state.from || undefined" @update:model-value="list.set({ to: $event })" />
      </template>
      <slot />
    </div>
  </div>
</template>

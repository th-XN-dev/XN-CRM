<script setup lang="ts">
import { computed } from 'vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import { useCenters } from '@/features/centers/api';
import { useListState } from '@/services/query/useListState';
import ManagementActivity from '../components/ManagementActivity.vue';

/** Platform settings: today the platform-wide management history, filterable by center. */
const list = useListState({ centerId: '' });
const centers = useCenters(() => ({ limit: 100, sortBy: 'name' as const, sortOrder: 'asc' as const }));
const options = computed(() => (centers.data.value?.items ?? []).map((c) => ({ value: c.id, label: c.name })));
</script>

<template>
  <PageHeader :title="$t('owner.platform.title')" :description="$t('owner.platform.subtitle')" />
  <div class="mb-4 max-w-xs">
    <FilterSelect
      :model-value="list.state.centerId"
      :label="$t('owner.directors.center')"
      :options="options"
      :all-label="$t('owner.platform.allCenters')"
      @update:model-value="list.set({ centerId: $event })"
    />
  </div>
  <ManagementActivity :center-id="list.state.centerId || undefined" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppAlert from '@/components/ui/AppAlert.vue';
import { useI18n } from 'vue-i18n';
import { useOwnerAnalytics } from '@/features/owner/api';
import MetricsComparison, { type ComparisonRow } from '../components/MetricsComparison.vue';
import MetricsSummary from '../components/MetricsSummary.vue';
import PeriodBar from '../components/PeriodBar.vue';
import { usePeriodFilter } from '../usePeriodFilter';

/** All centers side by side; aggregation and filtering happen on the server. */
const { t } = useI18n();
const filter = usePeriodFilter({ availability: '' });
const analytics = useOwnerAnalytics(filter.params);
const data = computed(() => analytics.data.value);
const currency = computed(() => (data.value?.currencies.length === 1 ? data.value.currencies[0] : undefined));
const availabilityOptions = computed(() =>
  (['ACTIVE', 'FROZEN', 'EXPIRED', 'NOT_STARTED'] as const).map((value) => ({ value, label: t(`status.availability.${value}`) })),
);
const rows = computed<ComparisonRow[]>(() =>
  (data.value?.rows ?? [])
    .filter((row) => !filter.list.state.availability || row.availability === filter.list.state.availability)
    .map((row) => ({
      id: row.id,
      name: row.name,
      to: { name: 'owner-center', params: { id: row.id } },
      badge: row.availability === 'ACTIVE' ? undefined : { kind: 'availability' as const, value: row.availability },
      metrics: row.metrics,
    })),
);
</script>

<template>
  <PageHeader :title="$t('owner.analytics.title')" :description="$t('owner.analytics.subtitle')" />
  <PeriodBar :filter="filter" :label="$t('owner.analytics.title')">
    <FilterSelect
      :model-value="filter.list.state.availability"
      :label="$t('owner.centers.status')"
      :options="availabilityOptions"
      @update:model-value="filter.list.set({ availability: $event })"
    />
  </PeriodBar>
  <QueryState :loading="analytics.isPending.value" :error="analytics.error.value" loading-variant="cards" @retry="analytics.refetch()">
    <div v-if="data" class="flex flex-col gap-6" :class="analytics.isFetching.value && 'opacity-80 transition-opacity'">
      <MetricsSummary :metrics="data.totals" :period="filter.label.value" :currency="currency" />
      <AppAlert v-if="data.currencies.length > 1" tone="info">{{ $t('owner.dashboard.mixedCurrencies', { list: data.currencies.join(', ') }) }}</AppAlert>
      <section>
        <h2 class="mb-3 text-sm font-semibold tracking-wide text-fg-muted uppercase">{{ $t('owner.analytics.table') }}</h2>
        <MetricsComparison :rows="rows" :caption="$t('owner.analytics.center')" :currency="currency" columns-id="owner-analytics" />
      </section>
    </div>
  </QueryState>
</template>

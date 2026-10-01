<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import FilterSelect from '@/components/data/FilterSelect.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import { useSessionStore } from '@/stores/session.store';
import { useCenterAnalytics } from '../api';
import MetricsComparison, { type ComparisonRow } from '../components/MetricsComparison.vue';
import MetricsSummary from '../components/MetricsSummary.vue';
import PeriodBar from '../components/PeriodBar.vue';
import { useKnownSubCenters } from '../useKnownSubCenters';
import { usePeriodFilter } from '../usePeriodFilter';

/** Center → sub-center → branch, for a period. Filters are applied by the API. */
const { t } = useI18n();
const session = useSessionStore();
const filter = usePeriodFilter({ subCenterId: '', branchId: '' }, () => session.organization?.timezone);
const analytics = useCenterAnalytics(() => ({
  ...filter.params.value,
  subCenterId: filter.list.state.subCenterId || undefined,
  branchId: filter.list.state.branchId || undefined,
}));
const data = computed(() => analytics.data.value);
const subCenterOptions = useKnownSubCenters(data);
const branchOptions = computed(() => session.branches.map((b) => ({ value: b.id, label: b.name })));
const subCenterRows = computed<ComparisonRow[]>(() =>
  (data.value?.subCenters ?? []).map((s) => ({
    id: s.id ?? 'direct',
    name: s.name ?? t('management.center.direct'),
    hint: t('management.center.branchCount', { count: s.branchCount }, s.branchCount),
    badge: s.status && s.status !== 'ACTIVE' ? { kind: 'center' as const, value: s.status } : undefined,
    metrics: s.metrics,
  })),
);
const branchRows = computed<ComparisonRow[]>(() =>
  (data.value?.branches ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    hint: b.code,
    badge: b.isActive ? undefined : { kind: 'active' as const, value: 'false' },
    metrics: b.metrics,
  })),
);
</script>

<template>
  <PageHeader :title="$t('management.analytics.title')" :description="$t('management.analytics.subtitle')" />
  <PeriodBar :filter="filter" :label="$t('management.analytics.title')">
    <FilterSelect
      v-if="subCenterOptions.length"
      :model-value="filter.list.state.subCenterId"
      :label="$t('management.analytics.subCenter')"
      :options="subCenterOptions"
      :all-label="$t('management.analytics.allSubCenters')"
      @update:model-value="filter.list.set({ subCenterId: $event, branchId: '' })"
    />
    <FilterSelect
      v-if="branchOptions.length > 1"
      :model-value="filter.list.state.branchId"
      :label="$t('management.analytics.branch')"
      :options="branchOptions"
      :all-label="$t('management.analytics.allBranches')"
      @update:model-value="filter.list.set({ branchId: $event })"
    />
  </PeriodBar>
  <QueryState :loading="analytics.isPending.value" :error="analytics.error.value" loading-variant="cards" @retry="analytics.refetch()">
    <div v-if="data" class="flex flex-col gap-6" :class="analytics.isFetching.value && 'opacity-80 transition-opacity'">
      <MetricsSummary :metrics="data.totals" :period="filter.label.value" :currency="data.center.currency" />
      <EmptyState v-if="!branchRows.length" compact :text="$t('management.analytics.empty')" />
      <template v-else>
        <section v-if="subCenterRows.length > 1">
          <h2 class="mb-3 text-sm font-semibold tracking-wide text-fg-muted uppercase">{{ $t('management.analytics.bySubCenter') }}</h2>
          <MetricsComparison :rows="subCenterRows" :caption="$t('management.analytics.subCenter')" :currency="data.center.currency" />
        </section>
        <section>
          <h2 class="mb-3 text-sm font-semibold tracking-wide text-fg-muted uppercase">{{ $t('management.analytics.byBranch') }}</h2>
          <MetricsComparison :rows="branchRows" :caption="$t('management.analytics.branch')" :currency="data.center.currency" columns-id="center-analytics" />
        </section>
      </template>
    </div>
  </QueryState>
</template>

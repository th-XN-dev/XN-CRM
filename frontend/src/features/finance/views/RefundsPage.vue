<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import FilterDate from '@/components/data/FilterDate.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useFormatters } from '@/composables/useFormatters';
import type { RefundListItemDto } from '@/services/api/schema.gen';
import { useListState } from '@/services/query/useListState';
import { useRefunds } from '../queries';

/** Money returned: when, to whom, from which payment, why and by whom. */
const { t } = useI18n();
const format = useFormatters();
const branches = useBranchOptions();
const list = useListState({ page: 1, branchId: '', from: '', to: '' });
const refunds = useRefunds(() => ({ ...list.params.value, limit: 20 }));
const columns = computed<DataColumn[]>(() => [
  { key: 'refundedAt', label: t('common.date') },
  { key: 'family', label: t('finance.payer') },
  { key: 'invoice', label: t('finance.invoice'), wide: true },
  { key: 'method', label: t('finance.method') },
  { key: 'reason', label: t('finance.reason') },
  { key: 'refundedBy', label: t('finance.refundedBy'), wide: true },
  { key: 'amount', label: t('common.amount'), align: 'right' },
]);
</script>

<template>
  <div>
    <ListToolbar :active-filters="list.activeFilters.value" @reset="list.reset()">
      <template #filters>
        <FilterDate :model-value="list.state.from" :label="$t('common.from')" @update:model-value="list.set({ from: $event })" />
        <FilterDate :model-value="list.state.to" :label="$t('common.to')" @update:model-value="list.set({ to: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
      </template>
    </ListToolbar>
    <ListPage
      :loading="refunds.isPending.value"
      :error="refunds.error.value"
      :meta="refunds.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t('finance.noRefundsTitle')"
      :empty-text="$t('finance.noRefunds')"
      @update:page="list.set({ page: $event })"
      @retry="refunds.refetch()"
    >
      <DataTable columns-id="refunds" :columns="columns" :rows="refunds.data.value?.items ?? []" :row-key="(row: RefundListItemDto) => row.id" :caption="$t('finance.refunds')" :loading="refunds.isFetching.value">
        <template #cell-refundedAt="{ row }">{{ format.dateTime(row.refundedAt) }}</template>
        <template #cell-family="{ row }">
          <RouterLink :to="{ name: 'family', params: { id: row.family.id } }" class="focus-ring rounded hover:text-primary-text">{{ row.family.name }}</RouterLink>
        </template>
        <template #cell-invoice="{ row }">
          <RouterLink :to="{ name: 'invoice', params: { id: row.invoice.id } }" class="focus-ring rounded text-fg-muted hover:text-primary-text">{{ row.invoice.invoiceNumber }}</RouterLink>
        </template>
        <template #cell-method="{ row }"><AppBadge>{{ $t(`finance.methods.${row.payment.method}`) }}</AppBadge></template>
        <template #cell-refundedBy="{ row }">{{ row.refundedBy.name }}</template>
        <template #cell-amount="{ row }"><span class="font-medium text-danger">−{{ format.money(row.amount) }}</span></template>
        <template #mobile="{ row }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-fg">{{ row.family.name }}</p>
              <p class="truncate text-sm text-fg-muted">{{ row.reason }}</p>
              <p class="text-xs text-fg-subtle">{{ format.dateTime(row.refundedAt) }} · {{ row.refundedBy.name }}</p>
            </div>
            <span class="shrink-0 font-semibold text-danger tabular-nums">−{{ format.money(row.amount) }}</span>
          </div>
        </template>
      </DataTable>
    </ListPage>
  </div>
</template>

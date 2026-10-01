<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable, { type DataColumn, type SortState } from '@/components/data/DataTable.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import { useFormatters } from '@/composables/useFormatters';
import { fullName } from '@/lib/people';
import type { InvoiceListItemDto } from '@/services/api/schema.gen';

/** Invoices: number, payer, due date, amount, what is left, status. */
const props = defineProps<{
  rows: readonly InvoiceListItemDto[];
  loading?: boolean;
  sort?: SortState;
  /** Hide the payer column (the page is already about one family/student). */
  hidePayer?: boolean;
}>();
defineEmits<{ sort: [sort: SortState] }>();
const { t } = useI18n();
const format = useFormatters();

const columns = computed<DataColumn[]>(() => [
  { key: 'invoiceNumber', label: t('finance.invoiceNumber') },
  ...(props.hidePayer ? [] : [{ key: 'payer', label: t('finance.payer') }]),
  { key: 'dueDate', label: t('finance.dueDate'), sortable: true },
  { key: 'finalAmount', label: t('common.amount'), align: 'right' as const, sortable: true },
  { key: 'debt', label: t('finance.left'), align: 'right' as const },
  { key: 'status', label: t('common.status') },
]);
</script>

<template>
  <DataTable
    :columns-id="hidePayer ? undefined : 'invoices'"
    :columns="columns"
    :rows="rows"
    :row-key="(row: InvoiceListItemDto) => row.id"
    :row-to="(row: InvoiceListItemDto) => ({ name: 'invoice', params: { id: row.id } })"
    :caption="$t('finance.invoices')"
    :loading="loading"
    :sort="sort"
    @sort="$emit('sort', $event)"
  >
    <template #cell-payer="{ row }">
      <span class="block">{{ row.family.name }}</span>
      <span v-if="row.student" class="block text-xs text-fg-muted">{{ fullName(row.student) }}</span>
    </template>
    <template #cell-dueDate="{ row }">{{ format.day(row.dueDate) }}</template>
    <template #cell-finalAmount="{ row }">{{ format.money(row.finalAmount) }}</template>
    <template #cell-debt="{ row }">
      <span :class="Number(row.debt) > 0 && row.status !== 'CANCELLED' ? 'font-medium text-fg' : 'text-fg-subtle'">{{ format.money(row.debt) }}</span>
    </template>
    <template #cell-status="{ row }"><StatusBadge kind="invoice" :value="row.status" /></template>
    <template #mobile="{ row }">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate font-medium text-fg">{{ hidePayer ? row.invoiceNumber : row.family.name }}</p>
          <p class="truncate text-sm text-fg-muted">
            <template v-if="!hidePayer">{{ row.invoiceNumber }} · </template>{{ $t('finance.dueOn', { date: format.day(row.dueDate) }) }}
          </p>
          <p v-if="row.student" class="truncate text-sm text-fg-muted">{{ fullName(row.student) }}</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <span class="font-semibold text-fg tabular-nums">{{ format.money(row.status === 'PAID' || row.status === 'CANCELLED' ? row.finalAmount : row.debt) }}</span>
          <StatusBadge kind="invoice" :value="row.status" />
        </div>
      </div>
    </template>
  </DataTable>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import { useFormatters } from '@/composables/useFormatters';
import type { PaymentResponseDto } from '@/services/api/schema.gen';

/** Payments received: date, payer, invoice, method, cashier, amount (refunds shown under it). */
const props = defineProps<{ rows: readonly PaymentResponseDto[]; loading?: boolean; hidePayer?: boolean }>();
defineEmits<{ open: [payment: PaymentResponseDto] }>();
const { t } = useI18n();
const format = useFormatters();

const columns = computed<DataColumn[]>(() => [
  { key: 'paymentDate', label: t('common.date') },
  ...(props.hidePayer ? [] : [{ key: 'family', label: t('finance.payer') }]),
  { key: 'invoice', label: t('finance.invoice'), wide: true },
  { key: 'method', label: t('finance.method') },
  { key: 'cashier', label: t('finance.cashier'), wide: true },
  { key: 'amount', label: t('common.amount'), align: 'right' as const },
]);
</script>

<template>
  <DataTable :columns="columns" :rows="rows" :row-key="(row: PaymentResponseDto) => row.id" :caption="$t('finance.payments')" :loading="loading">
    <template #cell-paymentDate="{ row }">{{ format.day(row.paymentDate) }}</template>
    <template #cell-family="{ row }">
      <RouterLink :to="{ name: 'family', params: { id: row.familyId } }" class="focus-ring rounded hover:text-primary-text">{{ row.family.name }}</RouterLink>
    </template>
    <template #cell-invoice="{ row }">
      <RouterLink :to="{ name: 'invoice', params: { id: row.invoiceId } }" class="focus-ring rounded text-fg-muted hover:text-primary-text">{{ row.invoice.invoiceNumber }}</RouterLink>
    </template>
    <template #cell-method="{ row }"><AppBadge>{{ $t(`finance.methods.${row.method}`) }}</AppBadge></template>
    <template #cell-cashier="{ row }">{{ row.cashier.name }}</template>
    <template #cell-amount="{ row }">
      <button type="button" class="focus-ring rounded font-medium text-fg hover:text-primary-text" @click="$emit('open', row)">
        {{ format.money(row.amount) }}
      </button>
      <span v-if="Number(row.refunded) > 0" class="block text-xs text-danger">−{{ format.money(row.refunded) }}</span>
    </template>
    <template #mobile="{ row }">
      <button type="button" class="flex w-full items-start justify-between gap-3 text-left" @click="$emit('open', row)">
        <span class="min-w-0">
          <span class="block truncate font-medium text-fg">{{ hidePayer ? row.invoice.invoiceNumber : row.family.name }}</span>
          <span class="block truncate text-sm text-fg-muted">{{ format.day(row.paymentDate) }} · {{ $t(`finance.methods.${row.method}`) }}</span>
        </span>
        <span class="shrink-0 text-right">
          <span class="block font-semibold text-fg tabular-nums">{{ format.money(row.amount) }}</span>
          <span v-if="Number(row.refunded) > 0" class="block text-xs text-danger">−{{ format.money(row.refunded) }}</span>
        </span>
      </button>
    </template>
  </DataTable>
</template>

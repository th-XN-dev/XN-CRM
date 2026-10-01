<script setup lang="ts">
import { ArrowRight, HandCoins, Plus, Receipt, Wallet } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import SectionCard from '@/components/data/SectionCard.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { api } from '@/services/api/http';
import type { FinanceSummaryReportDto } from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';
import { PAYMENT_METHODS } from '../api';
import ExpenseFormModal from '../components/ExpenseFormModal.vue';
import InvoiceFormModal from '../components/InvoiceFormModal.vue';
import PaymentFormModal from '../components/PaymentFormModal.vue';
import { useCurrentCashSession, useDebtors } from '../queries';

/**
 * Money at a glance: what to do now (take a payment, the cash desk, who owes
 * most), then the period's figures for managers.
 */
const { t } = useI18n();
const { can } = usePermission();
const format = useFormatters();
const period = ref<'today' | 'week' | 'month'>('month');
const summary = useApiQuery({
  key: () => ['finance', 'summary', period.value],
  fn: () => api.get<FinanceSummaryReportDto>('/reports/finance/summary', { params: { period: period.value } }),
  enabled: () => can(P.FINANCE_REPORT_READ),
  keepPrevious: true,
});
const cash = useCurrentCashSession(() => can(P.FINANCE_CASH_READ));
const debtors = useDebtors({ limit: 5 }, () => can(P.FINANCE_READ));
const paying = ref(false);
const invoicing = ref(false);
const spending = ref(false);

const periodOptions = computed(() => (['today', 'week', 'month'] as const).map((value) => ({ value, label: t(`dashboard.period.${value}`) })));
const kpis = computed(() => {
  const s = summary.data.value;
  if (!s) return [];
  return [
    { key: 'income', label: t('finance.kpi.income'), value: format.money(s.netPaid), hint: t('finance.kpi.payments', { count: s.paymentCount }, s.paymentCount) },
    { key: 'expenses', label: t('finance.kpi.expenses'), value: format.money(s.totalExpenses) },
    { key: 'net', label: t('finance.kpi.net'), value: format.money(s.netRevenue), danger: Number(s.netRevenue) < 0 },
    { key: 'debt', label: t('finance.kpi.debt'), value: format.money(s.totalDebt), hint: t('finance.kpi.overdue', { amount: format.money(s.overdueDebt) }), danger: Number(s.overdueDebt) > 0 },
  ];
});
const methodMax = computed(() => Math.max(1, ...PAYMENT_METHODS.map((m) => Number(summary.data.value?.byMethod[m].amount ?? 0))));
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="$t('nav.finance')" :description="$t('finance.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.FINANCE_PAYMENT_CREATE)" :icon="HandCoins" @click="paying = true">{{ $t('finance.receivePayment') }}</AppButton>
        <AppButton v-if="can(P.FINANCE_INVOICE_CREATE)" variant="secondary" :icon="Plus" @click="invoicing = true">{{ $t('finance.newInvoice') }}</AppButton>
        <AppButton v-if="can(P.FINANCE_EXPENSE_CREATE)" variant="secondary" :icon="Receipt" @click="spending = true">{{ $t('finance.newExpense') }}</AppButton>
      </template>
    </PageHeader>

    <div class="grid gap-4 lg:grid-cols-3">
      <SectionCard v-if="can(P.FINANCE_CASH_READ)" :title="$t('finance.cashDesk')">
        <template v-if="cash.data.value">
          <p class="text-xs text-fg-muted">{{ $t('finance.expectedBalance') }}</p>
          <p class="text-2xl font-semibold text-fg tabular-nums">{{ format.money(cash.data.value.totals.expectedBalance) }}</p>
          <p class="mt-1 text-sm text-fg-muted">{{ $t('finance.openSince', { time: format.dateTime(cash.data.value.openedAt) }) }}</p>
        </template>
        <p v-else-if="cash.isSuccess.value" class="text-sm text-fg-muted">{{ $t('finance.cashClosed') }}</p>
        <AppButton class="mt-4" variant="soft" :icon="Wallet" :to="{ name: 'finance-cash' }" block>
          {{ cash.data.value ? $t('finance.goToCash') : $t('finance.openCashDesk') }}
        </AppButton>
      </SectionCard>

      <SectionCard v-if="can(P.FINANCE_READ)" :title="$t('finance.topDebtors')" :class="can(P.FINANCE_CASH_READ) ? 'lg:col-span-2' : 'lg:col-span-3'" flush>
        <template #actions>
          <AppButton size="sm" variant="ghost" :icon="ArrowRight" :to="{ name: 'finance-debtors' }">{{ $t('common.seeAll') }}</AppButton>
        </template>
        <EmptyState v-if="debtors.data.value?.items.length === 0" compact :text="$t('finance.noDebtors')" />
        <ul v-else>
          <li v-for="debtor in debtors.data.value?.items ?? []" :key="debtor.familyId" class="border-t border-border first:border-0">
            <RouterLink :to="{ name: 'family', params: { id: debtor.familyId }, query: { tab: 'finance' } }" class="focus-ring flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover">
              <span class="min-w-0">
                <span class="block truncate font-medium text-fg">{{ debtor.familyName }}</span>
                <span class="block text-xs text-fg-muted">{{ $t('finance.studentsShort', { count: debtor.studentsCount }, debtor.studentsCount) }} · {{ debtor.phone }}</span>
              </span>
              <span class="shrink-0 text-right">
                <span class="block font-semibold text-fg tabular-nums">{{ format.money(debtor.amount) }}</span>
                <span v-if="Number(debtor.overdueAmount) > 0" class="block text-xs text-danger">{{ $t('finance.overdueAmount', { amount: format.money(debtor.overdueAmount) }) }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </SectionCard>
    </div>

    <section v-if="can(P.FINANCE_REPORT_READ)" class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-fg">{{ $t('finance.figures') }}</h2>
        <SegmentedControl v-model="period" name="finance-period" :label="$t('finance.figures')" :options="periodOptions" />
      </div>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4" :class="summary.isFetching.value && 'opacity-70'">
        <div v-for="kpi in kpis" :key="kpi.key" class="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <p class="text-xs font-medium text-fg-muted">{{ kpi.label }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums sm:text-2xl" :class="kpi.danger ? 'text-danger' : 'text-fg'">{{ kpi.value }}</p>
          <p v-if="kpi.hint" class="mt-0.5 text-xs" :class="kpi.danger ? 'text-danger' : 'text-fg-muted'">{{ kpi.hint }}</p>
        </div>
        <template v-if="!summary.data.value">
          <div v-for="n in 4" :key="n" class="h-24 animate-pulse rounded-2xl bg-surface-muted" />
        </template>
      </div>
      <SectionCard v-if="summary.data.value" :title="$t('finance.byMethod')">
        <ul class="flex flex-col gap-3">
          <li v-for="method in PAYMENT_METHODS" :key="method" class="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
            <span class="text-fg-muted">{{ $t(`finance.methods.${method}`) }}</span>
            <span class="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
              <span class="block h-full rounded-full bg-primary" :style="{ width: `${(Number(summary.data.value.byMethod[method].amount) / methodMax) * 100}%` }" />
            </span>
            <span class="font-medium text-fg tabular-nums">{{ format.money(summary.data.value.byMethod[method].amount) }}</span>
          </li>
        </ul>
      </SectionCard>
    </section>

    <PaymentFormModal v-model:open="paying" />
    <InvoiceFormModal v-model:open="invoicing" />
    <ExpenseFormModal v-model:open="spending" />
  </div>
</template>

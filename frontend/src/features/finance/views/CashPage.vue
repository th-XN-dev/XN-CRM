<script setup lang="ts">
import { HandCoins, Lock, Receipt, Unlock } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import MoneyInput from '@/components/forms/MoneyInput.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppPagination from '@/components/ui/AppPagination.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useEntityForm } from '@/composables/useEntityForm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { zMoney, zOptionalId, zOptionalText } from '@/lib/validation';
import type { CashSessionDetailDto, CashSessionResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { financeApi, MONEY_KEYS } from '../api';
import ExpenseFormModal from '../components/ExpenseFormModal.vue';
import MoneyReview from '../components/MoneyReview.vue';
import PaymentFormModal from '../components/PaymentFormModal.vue';
import PaymentTable from '../components/PaymentTable.vue';
import { useCashSessions, useCurrentCashSession, usePayments } from '../queries';

/**
 * The cashier's day on one screen: open the desk → take payments → watch the
 * expected balance → count the money and close → see the difference.
 */
const { t } = useI18n();
const { can } = usePermission();
const format = useFormatters();
const branches = useBranchOptions();
const current = useCurrentCashSession();
const session = computed(() => current.data.value ?? null);
const payments = usePayments(() => ({ cashSessionId: session.value?.id, limit: 50 }), () => !!session.value && can(P.FINANCE_PAYMENT_READ));
const historyPage = ref(1);
const history = useCashSessions(() => ({ page: historyPage.value, limit: 10, sortOrder: 'desc' }));
const paying = ref(false);
const spending = ref(false);
const closing = ref(false);
const closed = ref<CashSessionDetailDto | null>(null);

// ── open ────────────────────────────────────────────────────────────────────
const openSchema = z.object({ openingBalance: zMoney(0), note: zOptionalText(500), branchId: zOptionalId() });
const openDesk = useApiMutation({
  fn: (values: z.output<typeof openSchema>) => financeApi.openCashSession(values),
  invalidates: MONEY_KEYS,
  success: t('finance.cash.opened'),
  onSuccess: () => {
    closed.value = null;
    openForm.reset(); // the next opening starts from a clean form
  },
});
const openForm = useEntityForm({
  schema: openSchema,
  initialValues: () => ({ openingBalance: '0', note: '', branchId: branches.defaultId.value }),
  submit: (values) => openDesk.mutateAsync(values),
});
const [openingBalance] = openForm.defineField('openingBalance');
const [openNote] = openForm.defineField('note');
const [openBranch] = openForm.defineField('branchId');

// ── close ───────────────────────────────────────────────────────────────────
/** Closing is final: the counted amount and the difference are confirmed on a summary first. */
const closeReview = ref(false);
const closeSchema = z.object({ closingBalance: zMoney(0), note: zOptionalText(500) });
const closeDesk = useApiMutation({
  fn: (values: z.output<typeof closeSchema>) => financeApi.closeCashSession(session.value?.id ?? '', values),
  invalidates: MONEY_KEYS,
  success: t('finance.cash.closedToast'),
  onSuccess: (result) => {
    closing.value = false;
    closed.value = result;
  },
});
const closeForm = useEntityForm({
  schema: closeSchema,
  initialValues: () => ({ closingBalance: '', note: '' }),
  submit: async (values) => {
    if (!closeReview.value) {
      closeReview.value = true;
      return;
    }
    try {
      await closeDesk.mutateAsync(values);
    } catch (error) {
      closeReview.value = false;
      throw error;
    }
  },
  fieldCodes: { CASH_SESSION_NOT_OWNER: 'closingBalance' },
});
const [closingBalance] = closeForm.defineField('closingBalance');
const [closeNote] = closeForm.defineField('note');
watch(closing, (value) => {
  if (!value) return;
  closeReview.value = false;
  closeForm.reset();
});

const expected = computed(() => Number(session.value?.totals.expectedBalance ?? 0));
const liveDifference = computed(() =>
  closeForm.values.closingBalance === '' || closeForm.values.closingBalance === undefined ? null : Number(closeForm.values.closingBalance) - expected.value,
);
const differenceTone = (value: number) => (value === 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-warning');

const historyColumns = computed<DataColumn[]>(() => [
  { key: 'openedAt', label: t('finance.cash.openedAt') },
  { key: 'cashier', label: t('finance.cashier') },
  { key: 'branch', label: t('common.branch'), wide: true },
  { key: 'expectedBalance', label: t('finance.expectedBalance'), align: 'right' },
  { key: 'closingBalance', label: t('finance.cash.counted'), align: 'right' },
  { key: 'difference', label: t('finance.cash.difference'), align: 'right' },
  { key: 'status', label: t('common.status') },
]);
</script>

<template>
  <div class="flex flex-col gap-6">
    <QueryState :loading="current.isPending.value" :error="current.error.value" loading-variant="cards" @retry="current.refetch()">
      <!-- Just closed: the result, so the cashier can hand over the numbers. -->
      <SectionCard v-if="closed" :title="$t('finance.cash.closedTitle')">
        <dl class="grid grid-cols-3 gap-3">
          <div>
            <dt class="text-xs text-fg-muted">{{ $t('finance.expectedBalance') }}</dt>
            <dd class="text-lg font-semibold text-fg tabular-nums">{{ format.money(closed.expectedBalance ?? 0) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-fg-muted">{{ $t('finance.cash.counted') }}</dt>
            <dd class="text-lg font-semibold text-fg tabular-nums">{{ format.money(closed.closingBalance ?? 0) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-fg-muted">{{ $t('finance.cash.difference') }}</dt>
            <dd class="text-lg font-semibold tabular-nums" :class="differenceTone(Number(closed.difference ?? 0))">{{ format.money(closed.difference ?? 0) }}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard v-if="session" :title="$t('finance.cash.openTitle')" :description="$t('finance.openSince', { time: format.dateTime(session.openedAt) }) + ' · ' + session.branch.name">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-sm text-fg-muted">{{ $t('finance.expectedBalance') }}</p>
            <p class="text-4xl font-semibold tracking-tight text-fg tabular-nums">{{ format.money(session.totals.expectedBalance) }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <AppButton v-if="can(P.FINANCE_PAYMENT_CREATE)" :icon="HandCoins" @click="paying = true">{{ $t('finance.receivePayment') }}</AppButton>
            <AppButton v-if="can(P.FINANCE_EXPENSE_CREATE)" variant="secondary" :icon="Receipt" @click="spending = true">{{ $t('finance.newExpense') }}</AppButton>
            <AppButton v-if="can(P.FINANCE_CASH_CLOSE)" variant="secondary" :icon="Lock" @click="closing = true">{{ $t('finance.cash.close') }}</AppButton>
          </div>
        </div>
        <dl class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-xl bg-surface-muted p-3">
            <dt class="text-xs text-fg-muted">{{ $t('finance.cash.opening') }}</dt>
            <dd class="font-semibold text-fg tabular-nums">{{ format.money(session.openingBalance) }}</dd>
          </div>
          <div class="rounded-xl bg-surface-muted p-3">
            <dt class="text-xs text-fg-muted">{{ $t('finance.cash.cashIn', { count: session.totals.paymentCount }, session.totals.paymentCount) }}</dt>
            <dd class="font-semibold text-success tabular-nums">+{{ format.money(session.totals.cashIn) }}</dd>
          </div>
          <div class="rounded-xl bg-surface-muted p-3">
            <dt class="text-xs text-fg-muted">{{ $t('finance.refunds') }}</dt>
            <dd class="font-semibold text-danger tabular-nums">−{{ format.money(session.totals.refundsOut) }}</dd>
          </div>
          <div class="rounded-xl bg-surface-muted p-3">
            <dt class="text-xs text-fg-muted">{{ $t('finance.sections.expenses') }}</dt>
            <dd class="font-semibold text-danger tabular-nums">−{{ format.money(session.totals.expensesOut) }}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard v-else-if="can(P.FINANCE_CASH_OPEN)" :title="$t('finance.cash.openTitleClosed')" :description="$t('finance.cash.openHint')">
        <form class="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" novalidate @submit.prevent="openForm.onSubmit">
          <FormField v-slot="field" :label="$t('finance.cash.opening')" :error="openForm.errors.value.openingBalance">
            <MoneyInput :id="field.id" v-model="openingBalance" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <FormField v-if="branches.options.value.length > 1" v-slot="field" :label="$t('common.branch')" :error="openForm.errors.value.branchId">
            <AppSelect :id="field.id" v-model="openBranch" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <FormField v-else v-slot="field" :label="$t('common.note')" optional :error="openForm.errors.value.note">
            <AppInput :id="field.id" v-model="openNote" :invalid="field.invalid" :described-by="field.describedBy" />
          </FormField>
          <AppButton type="submit" :icon="Unlock" :loading="openForm.isSubmitting.value">{{ $t('finance.cash.open') }}</AppButton>
          <p v-if="openForm.formError.value" role="alert" class="text-sm text-danger sm:col-span-3">{{ openForm.formError.value }}</p>
        </form>
      </SectionCard>
    </QueryState>

    <SectionCard v-if="session && can(P.FINANCE_PAYMENT_READ)" :title="$t('finance.cash.sessionPayments')" flush>
      <EmptyState v-if="payments.data.value?.items.length === 0" compact :text="$t('finance.cash.noPayments')" />
      <PaymentTable v-else :rows="payments.data.value?.items ?? []" :loading="payments.isFetching.value" />
    </SectionCard>

    <SectionCard :title="$t('finance.cash.history')" flush>
      <EmptyState v-if="history.data.value?.meta.total === 0" compact :text="$t('finance.cash.noHistory')" />
      <DataTable
        v-else
        :columns="historyColumns"
        :rows="history.data.value?.items ?? []"
        :row-key="(row: CashSessionResponseDto) => row.id"
        :caption="$t('finance.cash.history')"
        :loading="history.isFetching.value"
      >
        <template #cell-openedAt="{ row }">{{ format.dateTime(row.openedAt) }}</template>
        <template #cell-cashier="{ row }">{{ row.cashier.name }}</template>
        <template #cell-branch="{ row }">{{ row.branch.name }}</template>
        <template #cell-expectedBalance="{ row }">{{ row.expectedBalance === null ? '—' : format.money(row.expectedBalance) }}</template>
        <template #cell-closingBalance="{ row }">{{ row.closingBalance === null ? '—' : format.money(row.closingBalance) }}</template>
        <template #cell-difference="{ row }">
          <span v-if="row.difference !== null" class="font-medium" :class="differenceTone(Number(row.difference))">{{ format.money(row.difference) }}</span>
          <template v-else>—</template>
        </template>
        <template #cell-status="{ row }"><StatusBadge kind="cash" :value="row.status" /></template>
        <template #mobile="{ row }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-fg">{{ row.cashier.name }}</p>
              <p class="text-sm text-fg-muted">{{ format.dateTime(row.openedAt) }}</p>
            </div>
            <div class="shrink-0 text-right">
              <StatusBadge kind="cash" :value="row.status" />
              <p v-if="row.difference !== null" class="mt-1 text-sm font-medium" :class="differenceTone(Number(row.difference))">{{ format.money(row.difference) }}</p>
            </div>
          </div>
        </template>
      </DataTable>
      <AppPagination v-if="(history.data.value?.meta.totalPages ?? 0) > 1" v-model="historyPage" :meta="history.data.value!.meta" class="px-4 py-3" />
    </SectionCard>

    <FormModal
      v-model:open="closing"
      :title="$t('finance.cash.closeTitle')"
      :description="$t('finance.cash.closeHint')"
      :submit-label="closeReview ? $t('finance.review.confirmClose') : $t('finance.review.continue')"
      :loading-label="$t('common.processing')"
      :loading="closeForm.isSubmitting.value"
      :error="closeForm.formError.value"
      size="sm"
      @submit="closeForm.onSubmit"
    >
      <MoneyReview
        v-if="closeReview"
        :amount="format.money(liveDifference ?? 0)"
        :amount-label="$t('finance.cash.difference')"
        :tone="liveDifference ? 'danger' : undefined"
        :rows="[
          { label: $t('finance.expectedBalance'), value: format.money(expected) },
          { label: $t('finance.cash.counted'), value: format.money(closeForm.values.closingBalance || 0) },
          { label: $t('finance.review.afterClose'), value: $t('finance.review.afterCloseText') },
        ]"
        @back="closeReview = false"
      />
      <div v-show="!closeReview" class="flex flex-col gap-4">
      <p class="rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm">
        {{ $t('finance.expectedBalance') }}: <strong class="tabular-nums">{{ format.money(expected) }}</strong>
      </p>
      <FormField v-slot="field" :label="$t('finance.cash.counted')" :error="closeForm.errors.value.closingBalance">
        <MoneyInput :id="field.id" v-model="closingBalance" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <p v-if="liveDifference !== null" class="text-sm" aria-live="polite">
        {{ $t('finance.cash.difference') }}:
        <strong class="tabular-nums" :class="differenceTone(liveDifference)">{{ format.money(liveDifference) }}</strong>
        <span class="text-fg-muted"> — {{ liveDifference === 0 ? $t('finance.cash.matches') : liveDifference < 0 ? $t('finance.cash.short') : $t('finance.cash.over') }}</span>
      </p>
      <FormField v-slot="field" :label="$t('common.note')" optional :error="closeForm.errors.value.note">
        <AppInput :id="field.id" v-model="closeNote" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      </div>
    </FormModal>
    <PaymentFormModal v-model:open="paying" />
    <ExpenseFormModal v-model:open="spending" />
  </div>
</template>

<script setup lang="ts">
import { Banknote, Building2, CircleEllipsis, CreditCard, Globe } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import EntityPicker from '@/components/forms/EntityPicker.vue';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import MoneyInput from '@/components/forms/MoneyInput.vue';
import MoneyReview from './MoneyReview.vue';
import AppAlert from '@/components/ui/AppAlert.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppInput from '@/components/ui/AppInput.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { usePickers } from '@/composables/usePickers';
import { orgDay } from '@/lib/dates';
import { zDate, zId, zMoney, zOptionalText } from '@/lib/validation';
import type { InvoiceDetailDto, PaymentResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { useToastStore } from '@/stores/toast.store';
import { financeApi, MONEY_KEYS, PAYMENT_METHODS, type PaymentMethod } from '../api';
import { useCurrentCashSession } from '../queries';

/**
 * Take money for an invoice. The remaining debt is prefilled; cash needs an
 * open cash desk (said before submit, not after). After saving, the invoice
 * is re-read so the toast states its real new status.
 */
const props = defineProps<{
  /** Fixed invoice (from the invoice page). */
  invoice?: Pick<InvoiceDetailDto, 'id' | 'invoiceNumber' | 'debt'> & { familyName: string } | null;
  /** Limit the picker to one family. */
  familyId?: string;
}>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [payment: PaymentResponseDto] }>();
const { t } = useI18n();
const { can } = usePermission();
const session = useSessionStore();
const toast = useToastStore();
const format = useFormatters();
const pickers = usePickers();
const remaining = ref<number | null>(null);
/** Idempotency key per dialog opening: a double click or a retry never charges twice. */
const transactionId = ref('');
/** Step 2 of 2: the summary the cashier confirms before the money is recorded. */
const reviewing = ref(false);
const invoiceLabel = ref('');

const cashDesk = useCurrentCashSession(() => open.value && can(P.FINANCE_CASH_READ));

const methodIcons = { CASH: Banknote, CARD: CreditCard, BANK_TRANSFER: Building2, ONLINE: Globe, OTHER: CircleEllipsis };
const methodOptions = computed(() =>
  PAYMENT_METHODS.map((method) => ({ value: method, label: t(`finance.methods.${method}`), icon: methodIcons[method] })),
);

const schema = z
  .object({
    invoiceId: zId(),
    amount: zMoney(),
    method: z.enum(PAYMENT_METHODS as [PaymentMethod, ...PaymentMethod[]]),
    paymentDate: zDate(),
    note: zOptionalText(1000),
  })
  .superRefine((values, context) => {
    if (remaining.value !== null && values.amount > remaining.value) {
      context.addIssue({ code: 'custom', path: ['amount'], message: t('finance.amountAboveDebt', { amount: format.money(remaining.value) }) });
    }
  });

const pay = useApiMutation({
  fn: (values: z.output<typeof schema>) => financeApi.createPayment({ ...values, transactionId: transactionId.value }),
  invalidates: MONEY_KEYS,
  onSuccess: async (payment) => {
    open.value = false;
    emit('saved', payment);
    const invoice = await financeApi.invoice(payment.invoiceId).catch(() => null);
    toast.success(
      invoice
        ? t('finance.paymentReceivedStatus', { amount: format.money(payment.amount), status: t(`status.invoice.${invoice.status}`) })
        : t('finance.paymentReceived', { amount: format.money(payment.amount) }),
    );
  },
});

const { defineField, errors, onSubmit, formError, reset, isSubmitting, values, setFieldValue } = useEntityForm({
  schema,
  initialValues: () => ({
    invoiceId: props.invoice?.id ?? '',
    amount: props.invoice ? String(Math.round(Number(props.invoice.debt))) : '',
    method: 'CASH' as PaymentMethod,
    paymentDate: orgDay(session.organization?.timezone),
    note: '',
  }),
  submit: async (formValues) => {
    if (!reviewing.value) {
      reviewing.value = true;
      return;
    }
    try {
      await pay.mutateAsync(formValues);
    } catch (error) {
      reviewing.value = false; // back to the fields, where the error is shown
      throw error;
    }
  },
  fieldCodes: {
    PAYMENT_EXCEEDS_BALANCE: 'amount',
    PAYMENT_DATE_IN_FUTURE: 'paymentDate',
    INVOICE_CANCELLED: 'invoiceId',
  },
});
const [invoiceId] = defineField('invoiceId');
const [amount] = defineField('amount');
const [paymentDate] = defineField('paymentDate');
const [note] = defineField('note');

const needsCashDesk = computed(
  () => values.method === 'CASH' && can(P.FINANCE_CASH_READ) && cashDesk.isSuccess.value && !cashDesk.data.value,
);

/** Picking an invoice fills in what is still owed. */
async function onInvoicePicked(id: string | undefined): Promise<void> {
  remaining.value = null;
  if (!id) return;
  const invoice = await financeApi.invoice(id);
  remaining.value = Math.round(Number(invoice.debt));
  setFieldValue('amount', String(remaining.value));
}

const reviewRows = computed(() => [
  { label: t('finance.invoice'), value: props.invoice ? `${props.invoice.invoiceNumber} · ${props.invoice.familyName}` : invoiceLabel.value },
  { label: t('finance.method'), value: t(`finance.methods.${values.method ?? 'CASH'}`) },
  { label: t('finance.paymentDate'), value: values.paymentDate ? format.day(values.paymentDate) : '' },
  ...(remaining.value !== null
    ? [{ label: t('finance.review.leftAfter'), value: format.money(Math.max(remaining.value - Number(values.amount || 0), 0)) }]
    : []),
  ...(values.note ? [{ label: t('common.note'), value: values.note }] : []),
]);

watch(open, (value) => {
  if (!value) return;
  reviewing.value = false;
  invoiceLabel.value = '';
  transactionId.value = crypto.randomUUID();
  remaining.value = props.invoice ? Math.round(Number(props.invoice.debt)) : null;
  reset();
});
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="$t('finance.receivePayment')"
    :description="invoice ? `${invoice.invoiceNumber} · ${invoice.familyName}` : undefined"
    :submit-label="reviewing ? $t('finance.review.confirmPayment') : $t('finance.review.continue')"
    :loading-label="$t('common.processing')"
    :loading="isSubmitting"
    :error="formError"
    @submit="onSubmit"
  >
    <MoneyReview
      v-if="reviewing"
      :amount="format.money(values.amount || 0)"
      :amount-label="$t('finance.review.paymentTitle')"
      :rows="reviewRows"
      @back="reviewing = false"
    />
    <div v-show="!reviewing" class="flex flex-col gap-4">
    <FormField v-if="!invoice" v-slot="field" :label="$t('finance.invoice')" :error="errors.invoiceId">
      <EntityPicker
        :id="field.id"
        v-model="invoiceId"
        :search="pickers.openInvoices({ familyId })"
        :placeholder="$t('finance.invoiceSearch')"
        :invalid="field.invalid"
        :described-by="field.describedBy"
        @select="invoiceLabel = $event?.label ?? ''; onInvoicePicked($event?.value)"
      />
    </FormField>
    <p v-if="remaining !== null" class="rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm text-fg">
      {{ $t('finance.remaining') }}: <strong class="tabular-nums">{{ format.money(remaining) }}</strong>
    </p>

    <FormField v-slot="field" :label="$t('common.amount')" :error="errors.amount">
      <MoneyInput :id="field.id" v-model="amount" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <SegmentedControl
      :model-value="values.method ?? 'CASH'"
      name="payment-method" :label="$t('finance.method')"
      :options="methodOptions"
      class="w-full flex-wrap"
      @update:model-value="setFieldValue('method', $event as PaymentMethod)"
    />
    <AppAlert v-if="needsCashDesk" tone="warning">
      {{ $t('errors.CASH_SESSION_REQUIRED') }}.
      <RouterLink :to="{ name: 'finance-cash' }" class="font-medium text-primary-text underline">{{ $t('finance.openCashDesk') }}</RouterLink>
    </AppAlert>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('finance.paymentDate')" :error="errors.paymentDate">
        <AppDatePicker :id="field.id" v-model="paymentDate" :max="orgDay(session.organization?.timezone)" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('common.note')" optional :error="errors.note">
        <AppInput :id="field.id" v-model="note" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    </div>
  </FormModal>
</template>

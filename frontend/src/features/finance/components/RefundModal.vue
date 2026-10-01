<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import MoneyInput from '@/components/forms/MoneyInput.vue';
import MoneyReview from './MoneyReview.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { useFormatters } from '@/composables/useFormatters';
import { zMoney, zText } from '@/lib/validation';
import { useApiMutation } from '@/services/query/useApiQuery';
import { financeApi, MONEY_KEYS } from '../api';

/** Give (part of) a payment back. The invoice debt re-opens; cash leaves the refunder's desk. */
export interface RefundTarget {
  id: string;
  amount: string;
  refunded: string;
  method: string;
  /** "INV-2026-000012 · Karimovlar · 300 000 UZS" */
  description: string;
}

const props = defineProps<{ payment: RefundTarget | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const format = useFormatters();
const reviewing = ref(false);
const refundable = computed(() => Math.round(Number(props.payment?.amount ?? 0) - Number(props.payment?.refunded ?? 0)));

const schema = z.object({ amount: zMoney(), reason: zText(1000) }).superRefine((values, context) => {
  if (values.amount > refundable.value) {
    context.addIssue({ code: 'custom', path: ['amount'], message: t('finance.refundAbove', { amount: format.money(refundable.value) }) });
  }
});
const refund = useApiMutation({
  fn: (values: z.output<typeof schema>) => financeApi.refund(props.payment?.id ?? '', values),
  invalidates: MONEY_KEYS,
  success: (result) => t('finance.refunded', { amount: format.money(result.amount) }),
  onSuccess: () => {
    open.value = false;
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting, values } = useEntityForm({
  schema,
  initialValues: () => ({ amount: String(refundable.value), reason: '' }),
  submit: async (values) => {
    if (!reviewing.value) {
      reviewing.value = true;
      return;
    }
    try {
      await refund.mutateAsync(values);
    } catch (error) {
      reviewing.value = false;
      throw error;
    }
  },
  fieldCodes: { REFUND_EXCEEDS_PAYMENT: 'amount' },
});
const [amount] = defineField('amount');
const [reason] = defineField('reason');
watch(open, (value) => {
  if (!value) return;
  reviewing.value = false;
  reset();
});
const reviewRows = computed(() => [
  { label: t('finance.payment'), value: props.payment?.description ?? '' },
  { label: t('finance.method'), value: props.payment ? t(`finance.methods.${props.payment.method}`) : '' },
  { label: t('finance.reason'), value: values.reason ?? '' },
  ...(props.payment?.method === 'CASH' ? [{ label: t('finance.review.cashOut'), value: t('finance.review.fromYourDesk') }] : []),
]);
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="$t('finance.refundTitle')"
    :description="payment?.description"
    :submit-label="reviewing ? $t('finance.review.confirmRefund') : $t('finance.review.continue')"
    :loading-label="$t('common.processing')"
    :loading="isSubmitting"
    :error="formError"
    danger
    size="sm"
    @submit="onSubmit"
  >
    <MoneyReview v-if="reviewing" :amount="format.money(values.amount || 0)" :amount-label="$t('finance.review.refundTitle')" :rows="reviewRows" tone="danger" @back="reviewing = false" />
    <div v-show="!reviewing" class="flex flex-col gap-4">
    <FormField v-slot="field" :label="$t('common.amount')" :hint="$t('finance.refundableHint', { amount: format.money(refundable) })" :error="errors.amount">
      <MoneyInput :id="field.id" v-model="amount" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('finance.reason')" :error="errors.reason">
      <AppTextarea :id="field.id" v-model="reason" :rows="2" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <p v-if="payment?.method === 'CASH'" class="text-sm text-fg-muted">{{ $t('finance.refundCashNote') }}</p>
    </div>
  </FormModal>
</template>

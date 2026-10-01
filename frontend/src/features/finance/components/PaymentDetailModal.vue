<script setup lang="ts">
import { Undo2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import InfoList, { type InfoItem } from '@/components/data/InfoList.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppModal from '@/components/ui/AppModal.vue';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import type { PaymentResponseDto } from '@/services/api/schema.gen';
import { usePayment } from '../queries';
import RefundModal from './RefundModal.vue';

/** One payment: who paid what, how, to whom — and its refunds. */
const props = defineProps<{ payment: PaymentResponseDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const { can } = usePermission();
const format = useFormatters();
const detail = usePayment(() => props.payment?.id ?? '', () => open.value && !!props.payment);
const refunding = ref(false);

const current = computed(() => detail.data.value ?? props.payment);
const refundable = computed(() => Number(current.value?.amount ?? 0) - Number(current.value?.refunded ?? 0));
const items = computed<InfoItem[]>(() => {
  const payment = current.value;
  if (!payment) return [];
  return [
    { key: 'amount', label: t('common.amount'), value: format.money(payment.amount) },
    { key: 'method', label: t('finance.method'), value: t(`finance.methods.${payment.method}`) },
    { key: 'date', label: t('finance.paymentDate'), value: format.day(payment.paymentDate) },
    { key: 'invoice', label: t('finance.invoice'), value: payment.invoice.invoiceNumber },
    { key: 'family', label: t('finance.payer'), value: payment.family.name },
    { key: 'cashier', label: t('finance.cashier'), value: payment.cashier.name },
    { key: 'note', label: t('common.note'), value: payment.note },
  ];
});
</script>

<template>
  <AppModal v-model:open="open" :title="$t('finance.payment')" size="md">
    <InfoList :items="items" :columns="2">
      <template #item-invoice>
        <RouterLink v-if="current" :to="{ name: 'invoice', params: { id: current.invoiceId } }" class="text-primary-text hover:underline">
          {{ current.invoice.invoiceNumber }}
        </RouterLink>
      </template>
      <template #item-family>
        <RouterLink v-if="current" :to="{ name: 'family', params: { id: current.familyId } }" class="text-primary-text hover:underline">
          {{ current.family.name }}
        </RouterLink>
      </template>
    </InfoList>
    <div v-if="detail.data.value?.refunds.length" class="mt-5">
      <h3 class="mb-2 text-sm font-semibold text-fg">{{ $t('finance.refunds') }}</h3>
      <ul class="flex flex-col gap-2">
        <li v-for="refund in detail.data.value.refunds" :key="refund.id" class="flex justify-between gap-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm">
          <span class="min-w-0 text-fg">{{ refund.reason }} <span class="block text-xs text-fg-muted">{{ format.dateTime(refund.refundedAt) }}</span></span>
          <span class="shrink-0 font-medium text-danger tabular-nums">−{{ format.money(refund.amount) }}</span>
        </li>
      </ul>
    </div>
    <template v-if="can(P.FINANCE_REFUND_CREATE) && refundable > 0" #footer>
      <AppButton variant="secondary" :icon="Undo2" @click="refunding = true">{{ $t('finance.refund') }}</AppButton>
    </template>
    <RefundModal
      v-model:open="refunding"
      :payment="current ? { ...current, description: `${current.invoice.invoiceNumber} · ${current.family.name} · ${format.money(current.amount)}` } : null"
    />
  </AppModal>
</template>

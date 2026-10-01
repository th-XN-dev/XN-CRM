<script setup lang="ts">
import { Ban, HandCoins, Pencil, Undo2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import DetailHeader from '@/components/data/DetailHeader.vue';
import InfoList, { type InfoItem } from '@/components/data/InfoList.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { fullName } from '@/lib/people';
import ActivityTimeline from '@/features/audit/ActivityTimeline.vue';
import CancelInvoiceModal from '../components/CancelInvoiceModal.vue';
import InvoiceFormModal from '../components/InvoiceFormModal.vue';
import PaymentFormModal from '../components/PaymentFormModal.vue';
import RefundModal, { type RefundTarget } from '../components/RefundModal.vue';
import { useInvoice } from '../queries';

/** One invoice: what is owed, what came in (and went back), and the next action. */
const props = defineProps<{ id: string }>();
const { t } = useI18n();
const { can } = usePermission();
const format = useFormatters();
const invoice = useInvoice(() => props.id);
const inv = computed(() => invoice.data.value);
const open = computed(() => inv.value && inv.value.status !== 'PAID' && inv.value.status !== 'CANCELLED');
const paying = ref(false);
const editing = ref(false);
const cancelling = ref(false);
const refunding = ref(false);
const refundTarget = ref<RefundTarget | null>(null);

const paidShare = computed(() => {
  const total = Number(inv.value?.finalAmount ?? 0);
  return total > 0 ? Math.min((Number(inv.value?.paid ?? 0) - Number(inv.value?.refunded ?? 0)) / total, 1) : 0;
});
const details = computed<InfoItem[]>(() => {
  const i = inv.value;
  if (!i) return [];
  return [
    { key: 'family', label: t('finance.family'), value: i.family.name },
    { key: 'student', label: t('finance.forStudent'), value: i.student ? fullName(i.student) : t('finance.wholeFamily') },
    { key: 'issueDate', label: t('finance.issueDate'), value: format.day(i.issueDate) },
    { key: 'dueDate', label: t('finance.dueDate'), value: format.day(i.dueDate) },
    { key: 'amount', label: t('common.amount'), value: format.money(i.amount) },
    { key: 'discount', label: t('finance.discount'), value: Number(i.discount) > 0 ? format.money(i.discount) : '—' },
    { key: 'description', label: t('common.description'), value: i.description },
    { key: 'branch', label: t('common.branch'), value: i.branch.name },
    ...(i.cancelReason ? [{ key: 'cancelReason', label: t('finance.cancelReason'), value: i.cancelReason }] : []),
  ];
});

/** Refunds are made on a payment of this invoice. */
function startRefund(line: { id: string; amount: string; method: string; paymentDate: string }): void {
  const i = inv.value;
  if (!i) return;
  const refunded = i.refunds.filter((r) => r.paymentId === line.id).reduce((sum, r) => sum + Number(r.amount), 0);
  refundTarget.value = {
    id: line.id,
    amount: line.amount,
    method: line.method,
    refunded: String(refunded),
    description: `${i.invoiceNumber} · ${format.day(line.paymentDate)} · ${format.money(line.amount)}`,
  };
  refunding.value = true;
}
</script>

<template>
  <QueryState :loading="invoice.isPending.value" :error="invoice.error.value" loading-variant="page" @retry="invoice.refetch()">
    <div v-if="inv" class="flex flex-col gap-4">
      <DetailHeader :title="inv.invoiceNumber" :subtitle="inv.family.name" :back="{ name: 'finance-invoices' }" :back-label="$t('finance.invoices')" class="!mb-2">
        <template #badges><StatusBadge kind="invoice" :value="inv.status" /></template>
        <template #actions>
          <AppButton v-if="open && can(P.FINANCE_PAYMENT_CREATE)" :icon="HandCoins" @click="paying = true">{{ $t('finance.receivePayment') }}</AppButton>
          <AppButton v-if="inv.status !== 'CANCELLED' && can(P.FINANCE_INVOICE_UPDATE)" variant="secondary" :icon="Pencil" @click="editing = true">{{ $t('common.edit') }}</AppButton>
          <AppButton v-if="inv.status !== 'CANCELLED' && can(P.FINANCE_INVOICE_CANCEL)" variant="ghost" :icon="Ban" @click="cancelling = true">{{ $t('finance.cancelInvoice') }}</AppButton>
        </template>
      </DetailHeader>

      <div class="grid gap-4 lg:grid-cols-3">
        <SectionCard class="lg:col-span-2">
          <div class="grid grid-cols-3 gap-3">
            <div>
              <p class="text-xs text-fg-muted">{{ $t('finance.toPay') }}</p>
              <p class="text-lg font-semibold text-fg tabular-nums sm:text-2xl">{{ format.money(inv.finalAmount) }}</p>
            </div>
            <div>
              <p class="text-xs text-fg-muted">{{ $t('finance.paid') }}</p>
              <p class="text-lg font-semibold text-success tabular-nums sm:text-2xl">{{ format.money(Number(inv.paid) - Number(inv.refunded)) }}</p>
            </div>
            <div>
              <p class="text-xs text-fg-muted">{{ $t('finance.left') }}</p>
              <p class="text-lg font-semibold tabular-nums sm:text-2xl" :class="Number(inv.debt) > 0 && inv.status !== 'CANCELLED' ? 'text-danger' : 'text-fg'">{{ format.money(inv.debt) }}</p>
            </div>
          </div>
          <div class="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" :aria-valuenow="Math.round(paidShare * 100)" aria-valuemin="0" aria-valuemax="100" :aria-label="$t('finance.paid')">
            <div class="h-full rounded-full bg-success" :style="{ width: `${paidShare * 100}%` }" />
          </div>
        </SectionCard>
        <SectionCard :title="$t('common.details')" class="lg:row-span-2">
          <InfoList :items="details">
            <template #item-family>
              <RouterLink :to="{ name: 'family', params: { id: inv.familyId } }" class="text-primary-text hover:underline">{{ inv.family.name }}</RouterLink>
            </template>
            <template v-if="inv.student" #item-student>
              <RouterLink :to="{ name: 'student', params: { id: inv.student.id } }" class="text-primary-text hover:underline">{{ fullName(inv.student) }}</RouterLink>
            </template>
          </InfoList>
        </SectionCard>
        <SectionCard :title="$t('finance.payments')" class="lg:col-span-2" flush>
          <EmptyState v-if="inv.payments.length === 0" compact :text="$t('finance.noPaymentsYet')" />
          <ul v-else>
            <li v-for="payment in inv.payments" :key="payment.id" class="flex items-center gap-3 border-t border-border px-5 py-3 first:border-0">
              <div class="min-w-0 flex-1">
                <p class="font-medium text-fg tabular-nums">{{ format.money(payment.amount) }}</p>
                <p class="text-xs text-fg-muted">{{ format.day(payment.paymentDate) }} · {{ $t(`finance.methods.${payment.method}`) }}<template v-if="payment.note"> · {{ payment.note }}</template></p>
                <p v-for="refund in inv.refunds.filter((r) => r.paymentId === payment.id)" :key="refund.id" class="text-xs text-danger">
                  −{{ format.money(refund.amount) }} · {{ refund.reason }}
                </p>
              </div>
              <AppButton v-if="can(P.FINANCE_REFUND_CREATE)" variant="ghost" size="sm" :icon="Undo2" @click="startRefund(payment)">{{ $t('finance.refund') }}</AppButton>
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard v-if="can(P.AUDIT_READ)" :title="$t('families.tabs.activity')">
        <ActivityTimeline entity-type="Invoice" :entity-id="inv.id" />
      </SectionCard>

      <PaymentFormModal v-model:open="paying" :invoice="{ id: inv.id, invoiceNumber: inv.invoiceNumber, debt: inv.debt, familyName: inv.family.name }" />
      <InvoiceFormModal v-model:open="editing" :invoice="inv" />
      <CancelInvoiceModal v-model:open="cancelling" :invoice="inv" />
      <RefundModal v-model:open="refunding" :payment="refundTarget" />
    </div>
  </QueryState>
</template>

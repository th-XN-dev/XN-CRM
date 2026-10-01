<script setup lang="ts">
import { HandCoins, Plus } from 'lucide-vue-next';
import { ref } from 'vue';
import { P } from '@/app/config/permissions';
import SectionCard from '@/components/data/SectionCard.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppPagination from '@/components/ui/AppPagination.vue';
import { usePermission } from '@/composables/usePermission';
import type { PaymentResponseDto } from '@/services/api/schema.gen';
import { useInvoices, usePayments } from '../queries';
import AccountSummary from './AccountSummary.vue';
import InvoiceFormModal from './InvoiceFormModal.vue';
import InvoiceTable from './InvoiceTable.vue';
import PaymentDetailModal from './PaymentDetailModal.vue';
import PaymentFormModal from './PaymentFormModal.vue';
import PaymentTable from './PaymentTable.vue';

/** Money of one family or student: balance, invoices, payments and the two everyday actions. */
const props = defineProps<{
  family: { id: string; name: string };
  student?: { id: string; name: string } | null;
}>();
const { can } = usePermission();
const invoicePage = ref(1);
const paymentPage = ref(1);
const scope = () => (props.student ? { studentId: props.student.id } : { familyId: props.family.id });
const invoices = useInvoices(() => ({ ...scope(), page: invoicePage.value, limit: 10, sortBy: 'dueDate', sortOrder: 'desc' }));
const payments = usePayments(
  () => ({ ...scope(), page: paymentPage.value, limit: 10 }),
  () => can(P.FINANCE_PAYMENT_READ),
);
const creatingInvoice = ref(false);
const paying = ref(false);
const openedPayment = ref<PaymentResponseDto | null>(null);
const paymentOpen = ref(false);

function openPayment(payment: PaymentResponseDto): void {
  openedPayment.value = payment;
  paymentOpen.value = true;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2">
      <AppButton v-if="can(P.FINANCE_PAYMENT_CREATE)" :icon="HandCoins" @click="paying = true">{{ $t('finance.receivePayment') }}</AppButton>
      <AppButton v-if="can(P.FINANCE_INVOICE_CREATE)" variant="secondary" :icon="Plus" @click="creatingInvoice = true">{{ $t('finance.newInvoice') }}</AppButton>
    </div>
    <AccountSummary :family-id="student ? undefined : family.id" :student-id="student?.id" />

    <SectionCard :title="$t('finance.invoices')" flush>
      <div class="px-2 pb-2 md:px-0 md:pb-0">
        <EmptyState v-if="invoices.data.value?.meta.total === 0" compact :text="$t('finance.noInvoices')" />
        <InvoiceTable v-else :rows="invoices.data.value?.items ?? []" :loading="invoices.isFetching.value" hide-payer />
      </div>
      <AppPagination
        v-if="(invoices.data.value?.meta.totalPages ?? 0) > 1"
        v-model="invoicePage"
        :meta="invoices.data.value!.meta"
        class="px-4 py-3"
      />
    </SectionCard>

    <SectionCard v-if="can(P.FINANCE_PAYMENT_READ)" :title="$t('finance.payments')" flush>
      <div class="px-2 pb-2 md:px-0 md:pb-0">
        <EmptyState v-if="payments.data.value?.meta.total === 0" compact :text="$t('finance.noPayments')" />
        <PaymentTable v-else :rows="payments.data.value?.items ?? []" :loading="payments.isFetching.value" hide-payer @open="openPayment" />
      </div>
      <AppPagination
        v-if="(payments.data.value?.meta.totalPages ?? 0) > 1"
        v-model="paymentPage"
        :meta="payments.data.value!.meta"
        class="px-4 py-3"
      />
    </SectionCard>

    <InvoiceFormModal v-model:open="creatingInvoice" :family="family" :student="student" />
    <PaymentFormModal v-model:open="paying" :family-id="family.id" />
    <PaymentDetailModal v-model:open="paymentOpen" :payment="openedPayment" />
  </div>
</template>

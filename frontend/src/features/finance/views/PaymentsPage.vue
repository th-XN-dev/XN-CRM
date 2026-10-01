<script setup lang="ts">
import { HandCoins } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import FilterDate from '@/components/data/FilterDate.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { usePermission } from '@/composables/usePermission';
import type { PaymentResponseDto } from '@/services/api/schema.gen';
import { useListState } from '@/services/query/useListState';
import { PAYMENT_METHODS, type PaymentListParams } from '../api';
import PaymentDetailModal from '../components/PaymentDetailModal.vue';
import PaymentFormModal from '../components/PaymentFormModal.vue';
import PaymentTable from '../components/PaymentTable.vue';
import { usePayments } from '../queries';

const { t } = useI18n();
const { can } = usePermission();
const branches = useBranchOptions();
const list = useListState({ page: 1, method: '', branchId: '', from: '', to: '' });
const payments = usePayments(() => ({ ...(list.params.value as PaymentListParams), limit: 20 }));
const methodOptions = computed(() => PAYMENT_METHODS.map((value) => ({ value, label: t(`finance.methods.${value}`) })));
const paying = ref(false);
const opened = ref<PaymentResponseDto | null>(null);
const detailOpen = ref(false);
function open(payment: PaymentResponseDto): void {
  opened.value = payment;
  detailOpen.value = true;
}
</script>

<template>
  <div>
    <ListToolbar :active-filters="list.activeFilters.value" @reset="list.reset()">
      <template #filters>
        <FilterSelect :model-value="list.state.method" :label="$t('finance.method')" :options="methodOptions" @update:model-value="list.set({ method: $event })" />
        <FilterDate :model-value="list.state.from" :label="$t('common.from')" @update:model-value="list.set({ from: $event })" />
        <FilterDate :model-value="list.state.to" :label="$t('common.to')" @update:model-value="list.set({ to: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
      </template>
      <template #actions>
        <AppButton v-if="can(P.FINANCE_PAYMENT_CREATE)" :icon="HandCoins" @click="paying = true">{{ $t('finance.receivePayment') }}</AppButton>
      </template>
    </ListToolbar>
    <ListPage
      :loading="payments.isPending.value"
      :error="payments.error.value"
      :meta="payments.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t('finance.noPaymentsTitle')"
      :empty-text="$t('finance.noPayments')"
      @update:page="list.set({ page: $event })"
      @retry="payments.refetch()"
    >
      <PaymentTable :rows="payments.data.value?.items ?? []" :loading="payments.isFetching.value" @open="open" />
    </ListPage>
    <PaymentFormModal v-model:open="paying" />
    <PaymentDetailModal v-model:open="detailOpen" :payment="opened" />
  </div>
</template>

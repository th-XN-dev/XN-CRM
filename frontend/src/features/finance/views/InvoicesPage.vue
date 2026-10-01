<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { P } from '@/app/config/permissions';
import FilterDate from '@/components/data/FilterDate.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { usePermission } from '@/composables/usePermission';
import { useListState } from '@/services/query/useListState';
import { INVOICE_STATUSES, type InvoiceListParams } from '../api';
import InvoiceFormModal from '../components/InvoiceFormModal.vue';
import InvoiceTable from '../components/InvoiceTable.vue';
import { useInvoices } from '../queries';

const { t } = useI18n();
const { can } = usePermission();
const router = useRouter();
const branches = useBranchOptions();
const list = useListState({ page: 1, search: '', status: '', branchId: '', from: '', to: '', sortBy: 'issueDate', sortOrder: 'desc' });
const invoices = useInvoices(() => ({ ...(list.params.value as InvoiceListParams), limit: 20 }));
const creating = ref(false);
const statusOptions = computed(() => INVOICE_STATUSES.map((value) => ({ value, label: t(`status.invoice.${value}`) })));
</script>

<template>
  <div>
    <ListToolbar :search="list.state.search" :search-label="$t('finance.invoiceSearchLabel')" :active-filters="list.activeFilters.value" @update:search="list.set({ search: $event })" @reset="list.reset()">
      <template #filters>
        <FilterSelect :model-value="list.state.status" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ status: $event })" />
        <FilterDate :model-value="list.state.from" :label="$t('finance.issuedFrom')" @update:model-value="list.set({ from: $event })" />
        <FilterDate :model-value="list.state.to" :label="$t('finance.issuedTo')" @update:model-value="list.set({ to: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
      </template>
      <template #actions>
        <AppButton v-if="can(P.FINANCE_INVOICE_CREATE)" :icon="Plus" @click="creating = true">{{ $t('finance.newInvoice') }}</AppButton>
      </template>
    </ListToolbar>
    <ListPage
      :create-label="can(P.FINANCE_INVOICE_CREATE) && !(list.state.search || list.activeFilters.value > 0) ? $t('finance.newInvoice') : undefined"
      :loading="invoices.isPending.value"
      :error="invoices.error.value"
      :meta="invoices.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t('finance.noInvoicesTitle')"
      :empty-text="$t('finance.noInvoices')"
      @create="creating = true"
      @update:page="list.set({ page: $event })"
      @retry="invoices.refetch()"
    >
      <InvoiceTable
        :rows="invoices.data.value?.items ?? []"
        :loading="invoices.isFetching.value"
        :sort="{ sortBy: list.state.sortBy, sortOrder: list.state.sortOrder as 'asc' | 'desc' }"
        @sort="list.set($event)"
      />
    </ListPage>
    <InvoiceFormModal v-model:open="creating" @saved="(invoice) => router.push({ name: 'invoice', params: { id: invoice.id } })" />
  </div>
</template>

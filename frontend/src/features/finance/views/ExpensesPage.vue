<script setup lang="ts">
import { Pencil, Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import FilterDate from '@/components/data/FilterDate.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import type { ExpenseResponseDto } from '@/services/api/schema.gen';
import { useListState } from '@/services/query/useListState';
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, type ExpenseListParams } from '../api';
import ExpenseFormModal from '../components/ExpenseFormModal.vue';
import { useExpenses } from '../queries';

const { t } = useI18n();
const { can } = usePermission();
const format = useFormatters();
const branches = useBranchOptions();
const list = useListState({ page: 1, category: '', paymentMethod: '', branchId: '', from: '', to: '', sortBy: 'expenseDate', sortOrder: 'desc' });
const expenses = useExpenses(() => ({ ...(list.params.value as ExpenseListParams), limit: 20 }));
const formOpen = ref(false);
const edited = ref<ExpenseResponseDto | null>(null);
const columns = computed<DataColumn[]>(() => [
  { key: 'expenseDate', label: t('common.date'), sortable: true },
  { key: 'category', label: t('finance.category') },
  { key: 'description', label: t('common.description'), wide: true },
  { key: 'paymentMethod', label: t('finance.method') },
  { key: 'createdBy', label: t('finance.recordedBy'), wide: true },
  { key: 'amount', label: t('common.amount'), align: 'right', sortable: true },
]);
const categoryOptions = computed(() => EXPENSE_CATEGORIES.map((value) => ({ value, label: t(`finance.categories.${value}`) })));
const methodOptions = computed(() => EXPENSE_METHODS.map((value) => ({ value, label: t(`finance.methods.${value}`) })));
function open(expense: ExpenseResponseDto | null): void {
  edited.value = expense;
  formOpen.value = true;
}
</script>

<template>
  <div>
    <ListToolbar :active-filters="list.activeFilters.value" @reset="list.reset()">
      <template #filters>
        <FilterSelect :model-value="list.state.category" :label="$t('finance.category')" :options="categoryOptions" @update:model-value="list.set({ category: $event })" />
        <FilterSelect :model-value="list.state.paymentMethod" :label="$t('finance.method')" :options="methodOptions" @update:model-value="list.set({ paymentMethod: $event })" />
        <FilterDate :model-value="list.state.from" :label="$t('common.from')" @update:model-value="list.set({ from: $event })" />
        <FilterDate :model-value="list.state.to" :label="$t('common.to')" @update:model-value="list.set({ to: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
      </template>
      <template #actions>
        <AppButton v-if="can(P.FINANCE_EXPENSE_CREATE)" :icon="Plus" @click="open(null)">{{ $t('finance.newExpense') }}</AppButton>
      </template>
    </ListToolbar>
    <ListPage
      :create-label="can(P.FINANCE_EXPENSE_CREATE) && !(list.activeFilters.value > 0) ? $t('finance.newExpense') : undefined"
      :loading="expenses.isPending.value"
      :error="expenses.error.value"
      :meta="expenses.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t('finance.noExpensesTitle')"
      :empty-text="$t('finance.noExpenses')"
      @create="open(null)"
      @update:page="list.set({ page: $event })"
      @retry="expenses.refetch()"
    >
      <DataTable
        columns-id="expenses"
        :columns="columns"
        :rows="expenses.data.value?.items ?? []"
        :row-key="(row: ExpenseResponseDto) => row.id"
        :caption="$t('finance.sections.expenses')"
        :loading="expenses.isFetching.value"
        :sort="{ sortBy: list.state.sortBy, sortOrder: list.state.sortOrder as 'asc' | 'desc' }"
        @sort="list.set($event)"
      >
        <template #cell-expenseDate="{ row }">{{ format.day(row.expenseDate) }}</template>
        <template #cell-category="{ row }"><AppBadge>{{ $t(`finance.categories.${row.category}`) }}</AppBadge></template>
        <template #cell-paymentMethod="{ row }">{{ $t(`finance.methods.${row.paymentMethod}`) }}</template>
        <template #cell-createdBy="{ row }">{{ row.createdBy.name }}</template>
        <template #cell-amount="{ row }"><span class="font-medium">{{ format.money(row.amount) }}</span></template>
        <template #mobile="{ row }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-fg">{{ $t(`finance.categories.${row.category}`) }}</p>
              <p class="truncate text-sm text-fg-muted">{{ row.description ?? $t(`finance.methods.${row.paymentMethod}`) }}</p>
              <p class="text-xs text-fg-subtle">{{ format.day(row.expenseDate) }}</p>
            </div>
            <span class="shrink-0 font-semibold text-fg tabular-nums">{{ format.money(row.amount) }}</span>
          </div>
        </template>
        <template v-if="can(P.FINANCE_EXPENSE_UPDATE)" #actions="{ row }">
          <AppButton variant="ghost" size="sm" icon-only :icon="Pencil" :label="$t('common.edit')" @click="open(row)" />
        </template>
      </DataTable>
    </ListPage>
    <ExpenseFormModal v-model:open="formOpen" :expense="edited" />
  </div>
</template>

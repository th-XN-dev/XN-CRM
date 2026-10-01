<script setup lang="ts">
import { ChevronDown, HandCoins, Phone } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import FilterDate from '@/components/data/FilterDate.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { fullName } from '@/lib/people';
import { useListState } from '@/services/query/useListState';
import type { DebtorListParams } from '../api';
import PaymentFormModal from '../components/PaymentFormModal.vue';
import { useDebtors } from '../queries';

/**
 * Collection screen: one row per family (they pay, not the child), biggest
 * debt first; open a family to see who owes what, then call or take payment.
 */
const { t } = useI18n();
const { can } = usePermission();
const format = useFormatters();
const branches = useBranchOptions();
const list = useListState({ page: 1, search: '', kind: '', minAmount: '', dueTo: '', branchId: '', sortBy: 'amount', sortOrder: 'desc' });
const params = computed<DebtorListParams>(() => ({
  page: list.state.page,
  limit: 20,
  search: list.state.search || undefined,
  overdue: list.state.kind === 'overdue' || undefined,
  partial: list.state.kind === 'partial' || undefined,
  minAmount: list.state.minAmount ? Number(list.state.minAmount) : undefined,
  dueTo: list.state.dueTo || undefined,
  branchId: list.state.branchId || undefined,
  sortBy: list.state.sortBy as DebtorListParams['sortBy'],
  sortOrder: list.state.sortOrder as 'asc' | 'desc',
}));
const debtors = useDebtors(params);
const expanded = ref(new Set<string>());
const payingFamily = ref<string | undefined>();
const paying = ref(false);

const kindOptions = computed(() => [
  { value: 'overdue', label: t('finance.debtKind.overdue') },
  { value: 'partial', label: t('finance.debtKind.partial') },
]);
const amountOptions = computed(() =>
  [100_000, 500_000, 1_000_000, 3_000_000].map((value) => ({ value: String(value), label: t('finance.atLeast', { amount: format.money(value) }) })),
);
const sortOptions = computed(() => [
  { value: 'amount', label: t('finance.sortBy.amount') },
  { value: 'oldestDueDate', label: t('finance.sortBy.oldest') },
  { value: 'name', label: t('finance.sortBy.name') },
]);

function toggle(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}
function pay(familyId: string): void {
  payingFamily.value = familyId;
  paying.value = true;
}
function sortBy(value: string): void {
  list.set({ sortBy: value || 'amount', sortOrder: value === 'oldestDueDate' || value === 'name' ? 'asc' : 'desc' });
}
</script>

<template>
  <div>
    <div v-if="debtors.data.value" class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div class="rounded-2xl border border-danger/30 bg-danger-soft p-4">
        <p class="text-xs font-medium text-danger">{{ $t('finance.totalDebt') }}</p>
        <p class="mt-1 text-xl font-semibold text-danger tabular-nums sm:text-2xl">{{ format.money(debtors.data.value.totalDebt) }}</p>
      </div>
      <div class="rounded-2xl border border-border bg-surface p-4">
        <p class="text-xs font-medium text-fg-muted">{{ $t('finance.overdueDebt') }}</p>
        <p class="mt-1 text-xl font-semibold text-fg tabular-nums sm:text-2xl">{{ format.money(debtors.data.value.overdueDebt) }}</p>
      </div>
      <div class="col-span-2 rounded-2xl border border-border bg-surface p-4 sm:col-span-1">
        <p class="text-xs font-medium text-fg-muted">{{ $t('finance.debtorFamilies') }}</p>
        <p class="mt-1 text-xl font-semibold text-fg tabular-nums sm:text-2xl">{{ debtors.data.value.meta.total }}</p>
      </div>
    </div>

    <ListToolbar
      :search="list.state.search"
      :search-label="$t('finance.debtorSearch')"
      :active-filters="list.activeFilters.value"
      @update:search="list.set({ search: $event })"
      @reset="list.reset()"
    >
      <template #filters>
        <FilterSelect :model-value="list.state.kind" :label="$t('finance.debtKind.label')" :options="kindOptions" @update:model-value="list.set({ kind: $event })" />
        <FilterSelect :model-value="list.state.minAmount" :label="$t('finance.minAmount')" :options="amountOptions" :all-label="$t('finance.anyAmount')" @update:model-value="list.set({ minAmount: $event })" />
        <FilterDate :model-value="list.state.dueTo" :label="$t('finance.dueBy')" @update:model-value="list.set({ dueTo: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
        <FilterSelect :model-value="list.state.sortBy" :label="$t('finance.sortBy.label')" :options="sortOptions" :all-label="$t('finance.sortBy.amount')" @update:model-value="sortBy" />
      </template>
    </ListToolbar>

    <ListPage
      :loading="debtors.isPending.value"
      :error="debtors.error.value"
      :meta="debtors.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t('finance.noDebtorsTitle')"
      :empty-text="$t('finance.noDebtors')"
      plain
      @update:page="list.set({ page: $event })"
      @retry="debtors.refetch()"
    >
      <ul class="flex flex-col gap-2" :class="debtors.isFetching.value && 'opacity-70'">
        <li v-for="family in debtors.data.value?.items ?? []" :key="family.familyId" class="rounded-2xl border border-border bg-surface shadow-card">
          <button
            type="button"
            class="focus-ring flex w-full items-center gap-3 rounded-2xl p-4 text-left"
            :aria-expanded="expanded.has(family.familyId)"
            :aria-controls="`debtor-${family.familyId}`"
            @click="toggle(family.familyId)"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold text-fg">{{ family.familyName }}</p>
              <p class="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
                <span>{{ $t('finance.studentsShort', { count: family.studentsCount }, family.studentsCount) }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ $t('finance.invoicesShort', { count: family.invoices }, family.invoices) }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ $t('finance.since', { date: format.day(family.oldestDueDate) }) }}</span>
              </p>
            </div>
            <div class="shrink-0 text-right">
              <p class="font-semibold text-fg tabular-nums sm:text-lg">{{ format.money(family.amount) }}</p>
              <AppBadge v-if="Number(family.overdueAmount) > 0" tone="danger">{{ $t('finance.overdueAmount', { amount: format.money(family.overdueAmount) }) }}</AppBadge>
              <AppBadge v-else-if="family.hasPartial" tone="warning">{{ $t('status.invoice.PARTIAL') }}</AppBadge>
            </div>
            <ChevronDown class="size-5 shrink-0 text-fg-subtle transition-transform" :class="expanded.has(family.familyId) && 'rotate-180'" aria-hidden="true" />
          </button>
          <div v-if="expanded.has(family.familyId)" :id="`debtor-${family.familyId}`" class="border-t border-border px-4 pt-3 pb-4">
            <ul class="flex flex-col gap-1.5">
              <li v-for="row in family.students" :key="row.studentId ?? 'family'" class="flex items-center justify-between gap-3 text-sm">
                <RouterLink v-if="row.studentId" :to="{ name: 'student', params: { id: row.studentId }, query: { tab: 'finance' } }" class="truncate text-fg hover:text-primary-text">
                  {{ fullName({ firstName: row.firstName ?? '', lastName: row.lastName ?? '' }) }}
                </RouterLink>
                <span v-else class="text-fg-muted">{{ $t('finance.familyCharges') }}</span>
                <span class="font-medium text-fg tabular-nums">{{ format.money(row.amount) }}</span>
              </li>
              <li class="mt-1 flex items-center justify-between gap-3 border-t border-dashed border-border pt-2 text-sm font-semibold">
                <span>{{ $t('common.total') }}</span><span class="tabular-nums">{{ format.money(family.amount) }}</span>
              </li>
            </ul>
            <div class="mt-4 flex flex-wrap gap-2">
              <AppButton v-if="can(P.FINANCE_PAYMENT_CREATE)" size="sm" :icon="HandCoins" @click="pay(family.familyId)">{{ $t('finance.receivePayment') }}</AppButton>
              <AppButton size="sm" variant="secondary" :icon="Phone" :href="`tel:${family.phone}`">{{ family.phone }}</AppButton>
              <AppButton size="sm" variant="ghost" :to="{ name: 'family', params: { id: family.familyId }, query: { tab: 'finance' } }">{{ $t('finance.openFamily') }}</AppButton>
            </div>
          </div>
        </li>
      </ul>
    </ListPage>
    <PaymentFormModal v-model:open="paying" :family-id="payingFamily" />
  </div>
</template>

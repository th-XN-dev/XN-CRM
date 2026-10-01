<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { P } from '@/app/config/permissions';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { usePermission } from '@/composables/usePermission';
import type { FamilyListItemDto } from '@/services/api/schema.gen';
import { useListState } from '@/services/query/useListState';
import FamilyFormModal from '../components/FamilyFormModal.vue';
import { useFamilies } from '../queries';

const { t } = useI18n();
const { can } = usePermission();
const router = useRouter();
const branches = useBranchOptions();
const list = useListState({ page: 1, search: '', isActive: 'true', branchId: '', sortBy: 'name', sortOrder: 'asc' });
const families = useFamilies(() => ({ ...list.params.value, limit: 20 }));
const creating = ref(false);

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('families.name'), sortable: true },
  { key: 'phone', label: t('common.phone') },
  { key: 'studentsCount', label: t('families.students'), align: 'right' },
  ...(branches.showFilter.value ? [{ key: 'branch', label: t('common.branch'), wide: true }] : []),
  { key: 'isActive', label: t('common.status') },
]);
const statusOptions = computed(() => [
  { value: 'true', label: t('status.active.true') },
  { value: 'false', label: t('status.active.false') },
]);
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.families')" :description="$t('families.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.FAMILIES_CREATE)" :icon="Plus" @click="creating = true">{{ $t('families.new') }}</AppButton>
      </template>
    </PageHeader>

    <ListToolbar
      :search="list.state.search"
      :search-label="$t('families.search')"
      :active-filters="list.activeFilters.value"
      @update:search="list.set({ search: $event })"
      @reset="list.reset()"
    >
      <template #filters>
        <FilterSelect
          :model-value="list.state.isActive"
          :label="$t('common.status')"
          :options="statusOptions"
          @update:model-value="list.set({ isActive: $event })"
        />
        <FilterSelect
          v-if="branches.showFilter.value"
          :model-value="list.state.branchId"
          :label="$t('common.branch')"
          :options="branches.options.value"
          @update:model-value="list.set({ branchId: $event })"
        />
      </template>
    </ListToolbar>

    <ListPage

      :create-label="can(P.FAMILIES_CREATE) && !(list.state.search || list.activeFilters.value > 1) ? $t('families.new') : undefined"

      :loading="families.isPending.value"
      :error="families.error.value"
      :meta="families.data.value?.meta"
      :page="list.state.page"
      :empty-title="list.state.search ? $t('common.noMatches') : $t('families.emptyTitle')"
      :empty-text="list.state.search ? undefined : $t('families.emptyText')"
      @create="creating = true"
      @update:page="list.set({ page: $event })"
      @retry="families.refetch()"
    >
      <DataTable
        columns-id="families"
        :columns="columns"
        :rows="families.data.value?.items ?? []"
        :row-key="(row: FamilyListItemDto) => row.id"
        :row-to="(row: FamilyListItemDto) => ({ name: 'family', params: { id: row.id } })"
        :caption="$t('nav.families')"
        :loading="families.isFetching.value"
        :sort="{ sortBy: list.state.sortBy, sortOrder: list.state.sortOrder as 'asc' | 'desc' }"
        @sort="list.set($event)"
      >
        <template #cell-branch="{ row }">{{ branches.nameOf(row.primaryBranchId) || '—' }}</template>
        <template #cell-isActive="{ row }"><StatusBadge kind="active" :value="row.isActive" /></template>
        <template #mobile="{ row }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-fg">{{ row.name }}</p>
              <p class="text-sm text-fg-muted">{{ row.phone }}</p>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1">
              <StatusBadge v-if="!row.isActive" kind="active" :value="false" />
              <span class="text-sm text-fg-muted">{{ $t('families.studentsCount', { count: row.studentsCount }, row.studentsCount) }}</span>
            </div>
          </div>
        </template>
      </DataTable>
    </ListPage>

    <FamilyFormModal v-model:open="creating" @saved="(family) => router.push({ name: 'family', params: { id: family.id } })" />
  </div>
</template>

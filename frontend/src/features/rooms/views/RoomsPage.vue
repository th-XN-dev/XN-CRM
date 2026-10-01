<script setup lang="ts">
import { CalendarDays, Pencil, Plus, Power } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
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
import type { RoomResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useListState } from '@/services/query/useListState';
import { roomsApi, useRooms } from '../api';
import RoomFormModal from '../components/RoomFormModal.vue';

const { t } = useI18n();
const { can } = usePermission();
const branches = useBranchOptions();
const list = useListState({ page: 1, search: '', isActive: 'true', branchId: '', sortBy: 'name', sortOrder: 'asc' });
const rooms = useRooms(() => ({ ...list.params.value, limit: 20 }));
const formOpen = ref(false);
const edited = ref<RoomResponseDto | null>(null);

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('rooms.name'), sortable: true },
  { key: 'code', label: t('common.code'), sortable: true },
  { key: 'capacity', label: t('rooms.capacity'), align: 'right' },
  { key: 'branch', label: t('common.branch') },
  { key: 'isActive', label: t('common.status') },
]);
const statusOptions = computed(() => [
  { value: 'true', label: t('status.active.true') },
  { value: 'false', label: t('status.active.false') },
]);
const toggle = useApiMutation({
  fn: (room: RoomResponseDto) => (room.isActive ? roomsApi.deactivate(room.id) : roomsApi.update(room.id, { isActive: true })),
  invalidates: [['rooms']],
  success: (room) => (room.isActive ? t('rooms.activated') : t('rooms.deactivated')),
  toastError: true,
});
function open(room: RoomResponseDto | null): void {
  edited.value = room;
  formOpen.value = true;
}
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.rooms')" :description="$t('rooms.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.ROOMS_CREATE)" :icon="Plus" @click="open(null)">{{ $t('rooms.new') }}</AppButton>
      </template>
    </PageHeader>
    <ListToolbar :search="list.state.search" :search-label="$t('rooms.search')" :active-filters="list.activeFilters.value" @update:search="list.set({ search: $event })" @reset="list.reset()">
      <template #filters>
        <FilterSelect :model-value="list.state.isActive" :label="$t('common.status')" :options="statusOptions" @update:model-value="list.set({ isActive: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
      </template>
    </ListToolbar>
    <ListPage
      :create-label="can(P.ROOMS_CREATE) && !(list.state.search || list.activeFilters.value > 1) ? $t('rooms.new') : undefined"
      :loading="rooms.isPending.value"
      :error="rooms.error.value"
      :meta="rooms.data.value?.meta"
      :page="list.state.page"
      :empty-title="$t('rooms.emptyTitle')"
      :empty-text="$t('rooms.emptyText')"
      @create="open(null)"
      @update:page="list.set({ page: $event })"
      @retry="rooms.refetch()"
    >
      <DataTable
        :columns="columns"
        :rows="rooms.data.value?.items ?? []"
        :row-key="(row: RoomResponseDto) => row.id"
        :caption="$t('nav.rooms')"
        :loading="rooms.isFetching.value"
        :sort="{ sortBy: list.state.sortBy, sortOrder: list.state.sortOrder as 'asc' | 'desc' }"
        @sort="list.set($event)"
      >
        <template #cell-branch="{ row }">{{ row.branch.name }}</template>
        <template #cell-isActive="{ row }"><StatusBadge kind="active" :value="row.isActive" /></template>
        <template #mobile="{ row }">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-fg">{{ row.name }} <span class="text-sm font-normal text-fg-muted">{{ row.code }}</span></p>
              <p class="text-sm text-fg-muted">{{ $t('rooms.seats', { count: row.capacity }, row.capacity) }} · {{ row.branch.name }}</p>
            </div>
            <StatusBadge v-if="!row.isActive" kind="active" :value="false" />
          </div>
        </template>
        <template #actions="{ row }">
          <AppButton variant="ghost" size="sm" icon-only :icon="CalendarDays" :label="$t('rooms.schedule')" :to="{ name: 'schedule', query: { roomId: row.id } }" />
          <AppButton v-if="can(P.ROOMS_UPDATE)" variant="ghost" size="sm" icon-only :icon="Pencil" :label="$t('common.edit')" @click="open(row)" />
          <AppButton
            v-if="can(row.isActive ? P.ROOMS_DELETE : P.ROOMS_UPDATE)"
            variant="ghost"
            size="sm"
            icon-only
            :icon="Power"
            :label="row.isActive ? $t('common.deactivate') : $t('common.activate')"
            @click="toggle.mutate(row)"
          />
        </template>
      </DataTable>
    </ListPage>
    <RoomFormModal v-model:open="formOpen" :room="edited" />
  </div>
</template>

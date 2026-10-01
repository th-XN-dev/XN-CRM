<script setup lang="ts">
import { KeyRound, MoreHorizontal, Pause, Play, Plus, ShieldCheck } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDropdown from '@/components/ui/AppDropdown.vue';
import AppDropdownItem from '@/components/ui/AppDropdownItem.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { useCenters } from '@/features/centers/api';
import CredentialsDialog, { type Credentials } from '@/features/shared/CredentialsDialog.vue';
import type { DirectorCredentialsDto, DirectorDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useListState } from '@/services/query/useListState';
import { directorsApi, useDirectors } from '../api';
import DirectorFormModal from './DirectorFormModal.vue';
import DirectorPermissionsModal from './DirectorPermissionsModal.vue';

/** Directors of every center (or of one, with `centerId`) and what the owner can do with them. */
const props = defineProps<{ centerId?: string }>();
const { t } = useI18n();
const format = useFormatters();
const confirm = useConfirm();
const list = useListState({ page: 1, search: '', centerId: '' }, ['centerId']);
const directors = useDirectors(() => ({
  page: list.state.page,
  limit: 20,
  search: list.state.search || undefined,
  centerId: props.centerId ?? (list.state.centerId || undefined),
}));
const centers = useCenters(() => ({ limit: 100, sortBy: 'name' as const, sortOrder: 'asc' as const }));
const centerOptions = computed(() => (centers.data.value?.items ?? []).map((c) => ({ value: c.id, label: c.name })));

const creating = ref(false);
const editing = ref<DirectorDto | null>(null);
const permissionsOpen = ref(false);
const credentials = ref<Credentials | null>(null);
const showCredentials = (result: DirectorCredentialsDto) => {
  credentials.value = { name: result.director.user.name, login: result.login, temporaryPassword: result.temporaryPassword };
};

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('owner.directors.name') },
  ...(props.centerId ? [] : [{ key: 'center', label: t('owner.directors.center') }]),
  { key: 'access', label: t('owner.directors.access') },
  { key: 'lastLogin', label: t('owner.directors.lastLogin'), wide: true },
  { key: 'status', label: t('common.status') },
]);

const reset = useApiMutation({
  fn: (director: DirectorDto) => directorsApi.resetPassword(director.id),
  invalidates: [['owner', 'directors']],
  toastError: true,
  onSuccess: showCredentials,
});
const setStatus = useApiMutation({
  fn: ({ director, status }: { director: DirectorDto; status: 'ACTIVE' | 'SUSPENDED' }) => directorsApi.update(director.id, { status }),
  invalidates: [['owner']],
  toastError: true,
  success: (_r, v) => (v.status === 'ACTIVE' ? t('owner.directors.reactivated') : t('owner.directors.suspended')),
});

async function askReset(director: DirectorDto): Promise<void> {
  if (await confirm({ title: t('owner.directors.resetTitle', { name: director.user.name }), message: t('owner.directors.resetText'), confirmLabel: t('owner.directors.resetPassword'), danger: true })) {
    reset.mutate(director);
  }
}
async function toggleStatus(director: DirectorDto): Promise<void> {
  if (director.status !== 'ACTIVE') return setStatus.mutate({ director, status: 'ACTIVE' });
  if (
    await confirm({
      title: t('owner.directors.suspendTitle', { name: director.user.name }),
      message: t('owner.directors.suspendText', { center: director.center.name }),
      confirmLabel: t('owner.directors.suspend'),
      danger: true,
    })
  ) {
    setStatus.mutate({ director, status: 'SUSPENDED' });
  }
}
defineExpose({ create: () => (creating.value = true) });

function editPermissions(director: DirectorDto): void {
  editing.value = director;
  permissionsOpen.value = true;
}
</script>

<template>
  <div>
    <ListToolbar
      :search="list.state.search"
      :search-label="$t('owner.directors.search')"
      :active-filters="list.activeFilters.value"
      @update:search="list.set({ search: $event })"
      @reset="list.reset()"
    >
      <template v-if="!centerId" #filters>
        <FilterSelect
          :model-value="list.state.centerId"
          :label="$t('owner.directors.center')"
          :options="centerOptions"
          :all-label="$t('owner.directors.allCenters')"
          @update:model-value="list.set({ centerId: $event })"
        />
      </template>
    </ListToolbar>
    <div v-if="centerId" class="mb-3 flex justify-end">
      <AppButton :icon="Plus" @click="creating = true">{{ $t('owner.directors.new') }}</AppButton>
    </div>
    <ListPage
      :create-label="!list.state.search && !list.state.centerId ? $t('owner.directors.new') : undefined"
      :loading="directors.isPending.value"
      :error="directors.error.value"
      :meta="directors.data.value?.meta"
      :page="list.state.page"
      :empty-title="list.state.search ? $t('common.noMatches') : $t('owner.directors.emptyTitle')"
      :empty-text="$t('owner.directors.emptyText')"
      @create="creating = true"
      @update:page="list.set({ page: $event })"
      @retry="directors.refetch()"
    >
      <DataTable
        :columns="columns"
        :rows="directors.data.value?.items ?? []"
        :row-key="(row: DirectorDto) => row.id"
        :caption="$t('owner.directors.title')"
        :loading="directors.isFetching.value"
      >
        <template #cell-name="{ row }">
          <span class="block font-medium">{{ row.user.name }}</span>
          <span class="block text-xs text-fg-muted">{{ row.user.email ?? row.user.phone }}</span>
        </template>
        <template #cell-center="{ row }">
          <RouterLink :to="{ name: 'owner-center', params: { id: row.center.id } }" class="focus-ring rounded text-primary-text hover:underline">{{ row.center.name }}</RouterLink>
        </template>
        <template #cell-access="{ row }">
          <AppBadge :tone="row.permissions ? 'warning' : 'brand'">
            {{ row.permissions ? $t('owner.directors.customAccess', { count: row.permissions.length }, row.permissions.length) : $t('owner.directors.fullAccess') }}
          </AppBadge>
        </template>
        <template #cell-lastLogin="{ row }">
          <span v-if="row.user.mustChangePassword" class="text-sm text-warning">{{ $t('owner.directors.temporary') }}</span>
          <span v-else class="text-sm">{{ row.user.lastLoginAt ? format.relative(row.user.lastLoginAt) : $t('owner.directors.never') }}</span>
        </template>
        <template #cell-status="{ row }"><StatusBadge kind="membership" :value="row.status" /></template>
        <template #mobile="{ row }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-fg">{{ row.user.name }}</p>
              <p class="truncate text-sm text-fg-muted">{{ row.center.name }} · {{ row.user.email ?? row.user.phone }}</p>
              <p v-if="row.user.mustChangePassword" class="text-xs text-warning">{{ $t('owner.directors.temporary') }}</p>
            </div>
            <StatusBadge kind="membership" :value="row.status" />
          </div>
        </template>
        <template #actions="{ row }">
          <AppDropdown :label="$t('common.actions')">
            <template #trigger="{ toggle, open: isOpen, menuId }">
              <AppButton variant="ghost" size="sm" icon-only :icon="MoreHorizontal" :label="$t('common.actions')" :aria-expanded="isOpen" :aria-controls="menuId" aria-haspopup="menu" @click="toggle" />
            </template>
            <AppDropdownItem :icon="ShieldCheck" @select="editPermissions(row)">{{ $t('owner.directors.permissions') }}</AppDropdownItem>
            <AppDropdownItem :icon="KeyRound" @select="askReset(row)">{{ $t('owner.directors.resetPassword') }}</AppDropdownItem>
            <AppDropdownItem :icon="row.status === 'ACTIVE' ? Pause : Play" :danger="row.status === 'ACTIVE'" @select="toggleStatus(row)">
              {{ row.status === 'ACTIVE' ? $t('owner.directors.suspend') : $t('owner.directors.reactivate') }}
            </AppDropdownItem>
          </AppDropdown>
        </template>
      </DataTable>
    </ListPage>

    <DirectorFormModal v-model:open="creating" :center-id="centerId" @created="showCredentials" />
    <DirectorPermissionsModal v-model:open="permissionsOpen" :director="editing" />
    <CredentialsDialog :credentials="credentials" @close="credentials = null" />
  </div>
</template>

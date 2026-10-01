<script setup lang="ts">
import { KeyRound, MoreHorizontal, Pause, Pencil, Play, Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import DataTable, { type DataColumn } from '@/components/data/DataTable.vue';
import ListPage from '@/components/data/ListPage.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDropdown from '@/components/ui/AppDropdown.vue';
import AppDropdownItem from '@/components/ui/AppDropdownItem.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import SettingsPanel from '@/features/settings/SettingsPanel.vue';
import CredentialsDialog, { type Credentials } from '@/features/shared/CredentialsDialog.vue';
import type { StaffCredentialsDto, StaffMemberDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useListState } from '@/services/query/useListState';
import { useAuthStore } from '@/stores/auth.store';
import { useSessionStore } from '@/stores/session.store';
import { staffApi, useStaff } from '../api';
import StaffFormModal from '../components/StaffFormModal.vue';

const { t, te } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const format = useFormatters();
const auth = useAuthStore();
const session = useSessionStore();
const list = useListState({ page: 1, search: '' });
const staff = useStaff(() => ({ page: list.state.page, limit: 20, search: list.state.search || undefined }));
const formOpen = ref(false);
const edited = ref<StaffMemberDto | null>(null);
const credentials = ref<Credentials | null>(null);
function show(r: StaffCredentialsDto): void {
  credentials.value = { name: r.member.user.name, login: r.login, temporaryPassword: r.temporaryPassword };
}

const columns = computed<DataColumn[]>(() => [
  { key: 'name', label: t('management.staff.name') },
  { key: 'role', label: t('management.staff.role') },
  { key: 'branches', label: t('management.staff.branches'), wide: true },
  { key: 'lastLogin', label: t('management.staff.lastLogin'), wide: true },
  { key: 'status', label: t('management.staff.status') },
]);
const roleLabel = (key: string) => (te(`roles.${key}`) ? t(`roles.${key}`) : key);
/** Directors and one's own access are managed by the platform owner, not here. */
const editable = (m: StaffMemberDto) => m.tier !== 'DIRECTOR' && m.user.id !== auth.profile?.id && can(P.USERS_UPDATE);

const setStatus = useApiMutation({
  fn: ({ member, status }: { member: StaffMemberDto; status: 'ACTIVE' | 'SUSPENDED' }) =>
    staffApi.update(session.organizationId ?? '', member.id, { status }),
  invalidates: [['staff'], ['members']],
  success: (_r, v) => (v.status === 'ACTIVE' ? t('management.staff.reactivated') : t('management.staff.suspended')),
  toastError: true,
});
const reset = useApiMutation({
  fn: (member: StaffMemberDto) => staffApi.resetPassword(session.organizationId ?? '', member.id),
  invalidates: [['staff']],
  toastError: true,
  onSuccess: show,
});
async function toggle(member: StaffMemberDto): Promise<void> {
  if (member.status !== 'ACTIVE') return setStatus.mutate({ member, status: 'ACTIVE' });
  if (await confirm({ title: t('management.staff.suspendTitle', { name: member.user.name }), message: t('management.staff.suspendText'), confirmLabel: t('management.staff.suspend'), danger: true })) {
    setStatus.mutate({ member, status: 'SUSPENDED' });
  }
}
async function askReset(member: StaffMemberDto): Promise<void> {
  if (await confirm({ title: t('management.staff.resetTitle', { name: member.user.name }), message: t('management.staff.resetText'), confirmLabel: t('management.staff.resetPassword'), danger: true })) {
    reset.mutate(member);
  }
}
function open(member: StaffMemberDto | null): void {
  edited.value = member;
  formOpen.value = true;
}
</script>

<template>
  <SettingsPanel :title="$t('management.staff.title')" :description="$t('management.staff.subtitle')">
    <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
      <ListToolbar class="min-w-0 flex-1" :search="list.state.search" :search-label="$t('management.staff.search')" :active-filters="0" @update:search="list.set({ search: $event })" @reset="list.reset()" />
      <AppButton v-if="can(P.USERS_CREATE)" :icon="Plus" @click="open(null)">{{ $t('management.staff.new') }}</AppButton>
    </div>
    <ListPage
      :loading="staff.isPending.value"
      :error="staff.error.value"
      :meta="staff.data.value?.meta"
      :page="list.state.page"
      :empty-title="list.state.search ? $t('common.noMatches') : $t('management.staff.emptyTitle')"
      :empty-text="$t('management.staff.emptyText')"
      @update:page="list.set({ page: $event })"
      @retry="staff.refetch()"
    >
      <DataTable :columns="columns" :rows="staff.data.value?.items ?? []" :row-key="(row: StaffMemberDto) => row.id" :caption="$t('management.staff.title')" :loading="staff.isFetching.value">
        <template #cell-name="{ row }">
          <span class="block font-medium">{{ row.user.name }}<AppBadge v-if="row.user.id === auth.profile?.id" class="ml-2" tone="brand">{{ $t('management.staff.you') }}</AppBadge></span>
          <span class="block text-xs text-fg-muted">{{ row.user.email ?? row.user.phone }}</span>
        </template>
        <template #cell-role="{ row }">
          <span>{{ roleLabel(row.role) }}</span>
          <span v-if="row.tier === 'DIRECTOR'" class="block text-xs text-fg-muted">{{ $t('management.staff.directorNote') }}</span>
        </template>
        <template #cell-branches="{ row }">
          <span class="text-sm">{{ row.allBranches ? $t('management.staff.allBranches') : row.branches.map((b) => b.name).join(', ') }}</span>
        </template>
        <template #cell-lastLogin="{ row }">
          <span v-if="row.user.mustChangePassword" class="text-sm text-warning">{{ $t('management.staff.temporary') }}</span>
          <span v-else class="text-sm">{{ row.user.lastLoginAt ? format.relative(row.user.lastLoginAt) : $t('management.staff.never') }}</span>
        </template>
        <template #cell-status="{ row }"><StatusBadge kind="membership" :value="row.status" /></template>
        <template #mobile="{ row }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-fg">{{ row.user.name }}</p>
              <p class="truncate text-sm text-fg-muted">{{ roleLabel(row.role) }} · {{ row.allBranches ? $t('management.staff.allBranches') : row.branches.map((b) => b.name).join(', ') }}</p>
            </div>
            <StatusBadge kind="membership" :value="row.status" />
          </div>
        </template>
        <template #actions="{ row }">
          <AppDropdown v-if="editable(row)" :label="$t('common.actions')">
            <template #trigger="{ toggle: toggleMenu, open: isOpen, menuId }">
              <AppButton variant="ghost" size="sm" icon-only :icon="MoreHorizontal" :label="$t('common.actions')" :aria-expanded="isOpen" :aria-controls="menuId" aria-haspopup="menu" @click="toggleMenu" />
            </template>
            <AppDropdownItem :icon="Pencil" @select="open(row)">{{ $t('management.staff.edit') }}</AppDropdownItem>
            <AppDropdownItem :icon="KeyRound" @select="askReset(row)">{{ $t('management.staff.resetPassword') }}</AppDropdownItem>
            <AppDropdownItem :icon="row.status === 'ACTIVE' ? Pause : Play" :danger="row.status === 'ACTIVE'" @select="toggle(row)">
              {{ row.status === 'ACTIVE' ? $t('management.staff.suspend') : $t('management.staff.reactivate') }}
            </AppDropdownItem>
          </AppDropdown>
        </template>
      </DataTable>
    </ListPage>
    <StaffFormModal v-model:open="formOpen" :member="edited" @created="show" />
    <CredentialsDialog :credentials="credentials" @close="credentials = null" />
  </SettingsPanel>
</template>

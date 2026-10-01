<script setup lang="ts">
import { Archive, MapPin, MoreHorizontal, Network, Pencil, Play, Plus, Snowflake } from 'lucide-vue-next';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDropdown from '@/components/ui/AppDropdown.vue';
import AppDropdownItem from '@/components/ui/AppDropdownItem.vue';
import { useConfirm } from '@/composables/useConfirm';
import { usePermission } from '@/composables/usePermission';
import BranchFormModal from '@/features/branches/components/BranchFormModal.vue';
import type { SubCenterDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { subCentersApi, type SubCenterStatus, useSubCenters } from '../api';
import SubCenterFormModal from '../components/SubCenterFormModal.vue';

const { t } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const subCenters = useSubCenters();
const formOpen = ref(false);
const edited = ref<SubCenterDto | null>(null);
const branchOpen = ref(false);
const branchParent = ref<string | null>(null);

const setStatus = useApiMutation({
  fn: ({ id, status }: { id: string; status: SubCenterStatus }) => subCentersApi.setStatus(id, status),
  invalidates: [['sub-centers'], ['branches'], ['analytics']],
  success: () => t('management.subCenters.statusChanged'),
  toastError: true,
});

function open(sub: SubCenterDto | null): void {
  edited.value = sub;
  formOpen.value = true;
}
function addBranch(sub: SubCenterDto): void {
  branchParent.value = sub.id;
  branchOpen.value = true;
}
async function change(sub: SubCenterDto, status: SubCenterStatus): Promise<void> {
  if (status === 'ACTIVE') return setStatus.mutate({ id: sub.id, status });
  const freeze = status === 'FROZEN';
  const ok = await confirm({
    title: t(freeze ? 'management.subCenters.freezeTitle' : 'management.subCenters.archiveTitle', { name: sub.name }),
    message: t(freeze ? 'management.subCenters.freezeText' : 'management.subCenters.archiveText'),
    confirmLabel: t(freeze ? 'management.subCenters.freeze' : 'management.subCenters.archive'),
    danger: true,
  });
  if (ok) setStatus.mutate({ id: sub.id, status });
}
</script>

<template>
  <div>
    <PageHeader :title="$t('management.subCenters.title')" :description="$t('management.subCenters.subtitle')">
      <template #actions>
        <AppButton v-if="can(P.SUB_CENTERS_MANAGE)" :icon="Plus" @click="open(null)">{{ $t('management.subCenters.new') }}</AppButton>
      </template>
    </PageHeader>
    <QueryState :loading="subCenters.isPending.value" :error="subCenters.error.value" loading-variant="cards" @retry="subCenters.refetch()">
      <EmptyState v-if="!subCenters.data.value?.length" :icon="Network" :title="$t('management.subCenters.emptyTitle')" :text="$t('management.subCenters.emptyText')">
        <AppButton v-if="can(P.SUB_CENTERS_MANAGE)" :icon="Plus" @click="open(null)">{{ $t('management.subCenters.new') }}</AppButton>
      </EmptyState>
      <ul v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <li v-for="sub in subCenters.data.value" :key="sub.id" class="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-card" :class="sub.status !== 'ACTIVE' && 'opacity-80'">
          <div class="flex items-start gap-3">
            <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-white" :style="{ background: sub.primaryColor ?? 'var(--color-primary)' }">
              <Network class="size-5" aria-hidden="true" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="truncate font-semibold text-fg">{{ sub.name }}</h2>
              <p class="truncate text-xs text-fg-muted">{{ sub.code }} · {{ sub.slug }}</p>
            </div>
            <StatusBadge kind="center" :value="sub.status" />
            <AppDropdown v-if="can(P.SUB_CENTERS_MANAGE)" :label="$t('common.actions')">
              <template #trigger="{ toggle, open: isOpen, menuId }">
                <AppButton variant="ghost" size="sm" icon-only :icon="MoreHorizontal" :label="$t('common.actions')" :aria-expanded="isOpen" :aria-controls="menuId" aria-haspopup="menu" @click="toggle" />
              </template>
              <AppDropdownItem :icon="Pencil" @select="open(sub)">{{ $t('common.edit') }}</AppDropdownItem>
              <AppDropdownItem v-if="sub.status !== 'ACTIVE'" :icon="Play" @select="change(sub, 'ACTIVE')">{{ $t('management.subCenters.activate') }}</AppDropdownItem>
              <AppDropdownItem v-if="sub.status === 'ACTIVE'" :icon="Snowflake" @select="change(sub, 'FROZEN')">{{ $t('management.subCenters.freeze') }}</AppDropdownItem>
              <AppDropdownItem v-if="sub.status !== 'ARCHIVED'" :icon="Archive" danger @select="change(sub, 'ARCHIVED')">{{ $t('management.subCenters.archive') }}</AppDropdownItem>
            </AppDropdown>
          </div>
          <h3 class="mt-4 mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">{{ $t('management.branches.title') }}</h3>
          <ul class="flex flex-1 flex-col gap-1 text-sm">
            <li v-for="branch in sub.branches" :key="branch.id" class="flex items-center gap-2 text-fg">
              <MapPin class="size-4 text-fg-subtle" aria-hidden="true" />
              <span class="truncate">{{ branch.name }}</span>
              <StatusBadge v-if="!branch.isActive" kind="active" :value="false" />
            </li>
            <li v-if="!sub.branches.length" class="text-fg-muted">{{ $t('management.subCenters.noBranches') }}</li>
          </ul>
          <AppButton v-if="can(P.BRANCH_CREATE) && sub.status !== 'ARCHIVED'" class="mt-3 self-start" variant="ghost" size="sm" :icon="Plus" @click="addBranch(sub)">
            {{ $t('management.subCenters.addBranch') }}
          </AppButton>
        </li>
      </ul>
    </QueryState>
    <SubCenterFormModal v-model:open="formOpen" :sub-center="edited" />
    <BranchFormModal v-model:open="branchOpen" :sub-center-id="branchParent" />
  </div>
</template>

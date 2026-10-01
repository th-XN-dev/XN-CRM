<script setup lang="ts">
import { Archive, Copy, MoreHorizontal, Pencil, Play, Snowflake, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import DetailHeader from '@/components/data/DetailHeader.vue';
import FilterSelect from '@/components/data/FilterSelect.vue';
import InfoList, { type InfoItem } from '@/components/data/InfoList.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDropdown from '@/components/ui/AppDropdown.vue';
import AppDropdownItem from '@/components/ui/AppDropdownItem.vue';
import AppTabs from '@/components/ui/AppTabs.vue';
import OrgTile from '@/components/ui/OrgTile.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { useRouteTab } from '@/composables/useRouteTab';
import MetricsComparison, { type ComparisonRow } from '@/features/analytics/components/MetricsComparison.vue';
import PeriodBar from '@/features/analytics/components/PeriodBar.vue';
import { useKnownSubCenters } from '@/features/analytics/useKnownSubCenters';
import { usePeriodFilter } from '@/features/analytics/usePeriodFilter';
import DirectorsTable from '@/features/directors/components/DirectorsTable.vue';
import ManagementActivity from '@/features/owner/components/ManagementActivity.vue';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useToastStore } from '@/stores/toast.store';
import { centersApi, useCenter, useCenterDeepAnalytics } from '../api';
import CenterEditModal from '../components/CenterEditModal.vue';
import DeleteCentersDialog from '../components/DeleteCentersDialog.vue';
import CenterLifecycleModal from '../components/CenterLifecycleModal.vue';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const format = useFormatters();
const confirm = useConfirm();
const toast = useToastStore();
const center = useCenter(() => props.id);
const data = computed(() => center.data.value);

const tabs = computed(() => (['overview', 'directors', 'analytics', 'activity'] as const).map((key) => ({ key, label: t(`owner.centers.tabs.${key}`) })));
const tab = useRouteTab(() => tabs.value.map((item) => item.key), 'overview');

const editing = ref(false);
const deleting = ref(false);
const router = useRouter();
const lifecycle = ref<'freeze' | 'activate'>('freeze');
const lifecycleOpen = ref(false);
function openLifecycle(action: 'freeze' | 'activate'): void {
  lifecycle.value = action;
  lifecycleOpen.value = true;
}
const archive = useApiMutation({
  fn: () => centersApi.archive(props.id),
  invalidates: [['owner']],
  success: () => t('owner.centers.archived'),
  toastError: true,
});
async function askArchive(): Promise<void> {
  if (!data.value) return;
  if (await confirm({ title: t('owner.centers.archiveTitle', { name: data.value.name }), message: t('owner.centers.archiveText'), confirmLabel: t('owner.centers.actions.archive'), danger: true })) {
    archive.mutate();
  }
}
async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t('owner.centers.copied'));
  } catch {
    toast.error(t('errors.UNKNOWN'));
  }
}

const period = computed(() => {
  const c = data.value;
  if (!c) return '';
  return `${c.activeFrom ? format.day(c.activeFrom) : '…'} — ${c.activeUntil ? format.day(c.activeUntil) : t('owner.centers.openEnded')}`;
});
const profile = computed<InfoItem[]>(() => {
  const c = data.value;
  if (!c) return [];
  return [
    { key: 'slug', label: t('owner.centers.slug'), value: c.slug },
    { key: 'period', label: t('owner.centers.period'), value: period.value },
    { key: 'phone', label: t('owner.centers.fields.phone'), value: c.phone },
    { key: 'email', label: t('owner.centers.fields.email'), value: c.email },
    { key: 'address', label: t('owner.centers.fields.address'), value: c.address },
    { key: 'regional', label: t('owner.centers.sections.regional'), value: `${c.timezone} · ${c.currency} · ${t(`language.${c.language}`)}` },
    { key: 'colors', label: t('owner.centers.sections.brand'), value: [c.primaryColor, c.secondaryColor].filter(Boolean).join(' / ') },
    { key: 'createdAt', label: t('owner.centers.createdAt'), value: format.day(c.createdAt) },
    ...(c.statusChangedAt ? [{ key: 'statusChangedAt', label: t('owner.centers.statusChangedAt'), value: format.dateTime(c.statusChangedAt) }] : []),
  ];
});
const counts = computed<InfoItem[]>(() => {
  const c = data.value;
  if (!c) return [];
  return [
    { key: 'subCenters', label: t('owner.centers.subCenters'), value: format.number(c.counts.subCenters) },
    { key: 'branches', label: t('owner.centers.branches'), value: format.number(c.counts.branches) },
    { key: 'members', label: t('owner.centers.members'), value: format.number(c.counts.members) },
    { key: 'students', label: t('owner.centers.students'), value: format.number(c.counts.activeStudents) },
  ];
});

// Analytics tab: the same numbers the center's director sees.
const filter = usePeriodFilter({ subCenterId: '' });
const analytics = useCenterDeepAnalytics(() => props.id, () => ({ ...filter.params.value, subCenterId: filter.list.state.subCenterId || undefined }));
const subCenterOptions = useKnownSubCenters(analytics.data);
const subCenterRows = computed<ComparisonRow[]>(() =>
  (analytics.data.value?.subCenters ?? []).map((s) => ({
    id: s.id ?? 'direct',
    name: s.name ?? t('management.center.direct'),
    hint: t('management.center.branchCount', { count: s.branchCount }, s.branchCount),
    badge: s.status && s.status !== 'ACTIVE' ? { kind: 'center' as const, value: s.status } : undefined,
    metrics: s.metrics,
  })),
);
const branchRows = computed<ComparisonRow[]>(() =>
  (analytics.data.value?.branches ?? []).map((b) => ({ id: b.id, name: b.name, hint: b.code, badge: b.isActive ? undefined : { kind: 'active' as const, value: 'false' }, metrics: b.metrics })),
);
</script>

<template>
  <QueryState :loading="center.isPending.value" :error="center.error.value" loading-variant="page" @retry="center.refetch()">
    <div v-if="data">
      <DetailHeader :title="data.name" :subtitle="data.slug" :back="{ name: 'owner-centers' }" :back-label="$t('owner.centers.title')">
        <template #leading><OrgTile :name="data.name" :color="data.primaryColor" :logo-url="data.logoUrl" class="hidden sm:inline-flex" /></template>
        <template #badges>
          <StatusBadge kind="availability" :value="data.availability" />
          <span class="text-xs text-fg-muted">{{ period }}</span>
        </template>
        <template #actions>
          <AppButton variant="secondary" :icon="Pencil" @click="editing = true">{{ $t('common.edit') }}</AppButton>
          <AppButton v-if="data.status === 'ACTIVE'" variant="secondary" :icon="Snowflake" @click="openLifecycle('freeze')">{{ $t('owner.centers.actions.freeze') }}</AppButton>
          <AppButton v-else :icon="Play" @click="openLifecycle('activate')">{{ $t('owner.centers.actions.activate') }}</AppButton>
          <AppDropdown :label="$t('common.actions')">
            <template #trigger="{ toggle, open: isOpen, menuId }">
              <AppButton variant="secondary" icon-only :icon="MoreHorizontal" :label="$t('common.actions')" :aria-expanded="isOpen" :aria-controls="menuId" aria-haspopup="menu" @click="toggle" />
            </template>
            <AppDropdownItem v-if="data.status !== 'ARCHIVED'" :icon="Archive" danger @select="askArchive">{{ $t('owner.centers.actions.archive') }}</AppDropdownItem>
            <AppDropdownItem v-else :icon="Trash2" danger @select="deleting = true">{{ $t('owner.centers.remove.action') }}</AppDropdownItem>
          </AppDropdown>
        </template>
      </DetailHeader>

      <AppTabs v-model="tab" :tabs="tabs" :label="data.name" class="mb-5" />

      <div v-if="tab === 'overview'" class="grid gap-4 lg:grid-cols-3">
        <SectionCard :title="$t('owner.centers.sections.profile')" class="lg:col-span-2">
          <InfoList :items="profile" :columns="2" />
        </SectionCard>
        <div class="flex flex-col gap-4">
          <SectionCard :title="$t('owner.centers.accessUrl')">
            <template v-if="data.accessUrl">
              <p class="font-mono text-sm break-all text-fg">{{ data.accessUrl }}</p>
              <AppButton class="mt-2" variant="secondary" size="sm" :icon="Copy" @click="copy(data.accessUrl)">{{ $t('owner.centers.copy') }}</AppButton>
              <p class="mt-2 text-xs text-fg-muted">{{ $t('owner.centers.accessUrlHint') }}</p>
            </template>
            <p v-else class="text-sm text-fg-muted">{{ $t('owner.centers.noAccessUrl') }}</p>
          </SectionCard>
          <SectionCard :title="$t('owner.centers.directors')">
            <ul v-if="data.directors.length" class="flex flex-col gap-1 text-sm">
              <li v-for="d in data.directors" :key="d.id" class="flex items-center justify-between gap-2">
                <span class="truncate text-fg">{{ d.name }}</span>
                <span v-if="d.mustChangePassword" class="text-xs text-warning">{{ $t('owner.directors.temporary') }}</span>
              </li>
            </ul>
            <p v-else class="text-sm text-warning">{{ $t('owner.centers.noDirector') }}</p>
          </SectionCard>
          <SectionCard>
            <InfoList :items="counts" :columns="2" />
          </SectionCard>
        </div>
      </div>

      <DirectorsTable v-else-if="tab === 'directors'" :center-id="data.id" />

      <div v-else-if="tab === 'analytics'">
        <PeriodBar :filter="filter" :label="$t('owner.centers.tabs.analytics')">
          <FilterSelect
            v-if="subCenterOptions.length"
            :model-value="filter.list.state.subCenterId"
            :label="$t('management.analytics.subCenter')"
            :options="subCenterOptions"
            :all-label="$t('management.analytics.allSubCenters')"
            @update:model-value="filter.list.set({ subCenterId: $event })"
          />
        </PeriodBar>
        <QueryState :loading="analytics.isPending.value" :error="analytics.error.value" loading-variant="cards" @retry="analytics.refetch()">
          <div v-if="analytics.data.value" class="flex flex-col gap-6">
            <section v-if="subCenterRows.length > 1">
              <h2 class="mb-3 text-sm font-semibold tracking-wide text-fg-muted uppercase">{{ $t('management.analytics.bySubCenter') }}</h2>
              <MetricsComparison :rows="subCenterRows" :caption="$t('management.analytics.subCenter')" :currency="data.currency" />
            </section>
            <section>
              <h2 class="mb-3 text-sm font-semibold tracking-wide text-fg-muted uppercase">{{ $t('management.analytics.byBranch') }}</h2>
              <MetricsComparison :rows="branchRows" :caption="$t('management.analytics.branch')" :currency="data.currency" />
            </section>
          </div>
        </QueryState>
      </div>

      <ManagementActivity v-else :center-id="data.id" />

      <CenterEditModal v-model:open="editing" :center="data" />
      <CenterLifecycleModal v-model:open="lifecycleOpen" :center="data" :action="lifecycle" />
      <DeleteCentersDialog v-model:open="deleting" :centers="[data]" @deleted="router.replace({ name: 'owner-centers' })" />
    </div>
  </QueryState>
</template>

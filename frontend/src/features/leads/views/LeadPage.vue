<script setup lang="ts">
import {
  CalendarClock,
  GraduationCap,
  House,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  RefreshCw,
  Send,
  Trash2,
  UserCheck,
} from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { P } from '@/app/config/permissions';
import DetailHeader from '@/components/data/DetailHeader.vue';
import InfoList, { type InfoItem } from '@/components/data/InfoList.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDropdown from '@/components/ui/AppDropdown.vue';
import AppDropdownItem from '@/components/ui/AppDropdownItem.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useMembers } from '@/features/organizations/queries';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useAuthStore } from '@/stores/auth.store';
import { ACTIVITY_TYPES, type ActivityType, LEAD_KEYS, leadsApi } from '../api';
import ConvertLeadModal from '../components/ConvertLeadModal.vue';
import FollowUpModal from '../components/FollowUpModal.vue';
import LeadFormModal from '../components/LeadFormModal.vue';
import LeadStatusModal from '../components/LeadStatusModal.vue';
import { useLead, useLeadActivities } from '../queries';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const router = useRouter();
const format = useFormatters();
const auth = useAuthStore();
const lead = useLead(() => props.id);
const activities = useLeadActivities(() => props.id, () => can(P.LEADS_ACTIVITY_READ));
const l = computed(() => lead.data.value);
const members = useMembers(() => l.value?.branchId);
const isOpen = computed(() => !!l.value && l.value.status !== 'CONVERTED' && l.value.status !== 'LOST');

const editing = ref(false);
const statusOpen = ref(false);
const followUpOpen = ref(false);
const converting = ref(false);
const activityType = ref<ActivityType>('CALL');
const activityNote = ref('');

const assign = useApiMutation({
  fn: (userId: string | null) => leadsApi.assign(props.id, userId),
  invalidates: LEAD_KEYS,
  success: (updated) => (updated.assignedToId ? t('leads.assigned') : t('leads.unassignedToast')),
  toastError: true,
});
const addActivity = useApiMutation({
  fn: () => leadsApi.addActivity(props.id, activityType.value, activityNote.value.trim() || undefined),
  invalidates: [['leads']],
  success: t('leads.activityAdded'),
  toastError: true,
  onSuccess: () => {
    activityNote.value = '';
  },
});
const remove = useApiMutation({
  fn: () => leadsApi.remove(props.id),
  invalidates: LEAD_KEYS,
  success: t('leads.deleted'),
  toastError: true,
  onSuccess: async () => {
    await router.push({ name: 'leads' });
  },
});

async function confirmDelete(): Promise<void> {
  if (await confirm({ title: t('leads.deleteTitle', { name: l.value?.name ?? '' }), message: t('leads.deleteText'), danger: true, confirmLabel: t('common.delete') })) {
    remove.mutate();
  }
}

const activityOptions = computed(() => ACTIVITY_TYPES.map((value) => ({ value, label: t(`leads.activityTypes.${value}`) })));
const contact = computed<InfoItem[]>(() => {
  const data = l.value;
  if (!data) return [];
  return [
    { key: 'phone', label: t('common.phone'), value: data.phone },
    { key: 'secondaryPhone', label: t('families.secondaryPhone'), value: data.secondaryPhone },
    { key: 'source', label: t('leads.source'), value: data.source?.name },
    { key: 'branch', label: t('common.branch'), value: data.branch.name },
    { key: 'createdAt', label: t('common.createdAt'), value: format.dateTime(data.createdAt) },
    ...(data.lostReason ? [{ key: 'lostReason', label: t('leads.lostReason'), value: data.lostReason }] : []),
    { key: 'notes', label: t('common.notes'), value: data.notes },
  ];
});
const followUpOverdue = computed(() => !!l.value?.nextFollowUpAt && new Date(l.value.nextFollowUpAt) < new Date());
</script>

<template>
  <QueryState :loading="lead.isPending.value" :error="lead.error.value" loading-variant="page" @retry="lead.refetch()">
    <div v-if="l">
      <DetailHeader :title="l.name" :subtitle="l.phone" :back="{ name: 'leads' }" :back-label="$t('nav.leads')">
        <template #badges>
          <StatusBadge kind="lead" :value="l.status" />
          <StatusBadge kind="leadPriority" :value="l.priority" />
        </template>
        <template #actions>
          <AppButton v-if="isOpen && can(P.LEADS_CONVERT)" :icon="GraduationCap" @click="converting = true">{{ $t('leads.convert') }}</AppButton>
          <AppButton variant="secondary" :icon="Phone" :href="`tel:${l.phone}`">{{ $t('leads.call') }}</AppButton>
          <AppButton v-if="isOpen && can(P.LEADS_UPDATE)" variant="secondary" :icon="RefreshCw" @click="statusOpen = true">{{ $t('leads.changeStatus') }}</AppButton>
          <AppDropdown v-if="can([P.LEADS_UPDATE, P.LEADS_DELETE])" :label="$t('common.actions')">
            <template #trigger="{ toggle, open, menuId }">
              <AppButton variant="secondary" icon-only :icon="MoreHorizontal" :label="$t('common.actions')" :aria-expanded="open" :aria-controls="menuId" aria-haspopup="menu" @click="toggle" />
            </template>
            <AppDropdownItem v-if="can(P.LEADS_UPDATE)" :icon="Pencil" @select="editing = true">{{ $t('common.edit') }}</AppDropdownItem>
            <AppDropdownItem v-if="isOpen && can(P.LEADS_UPDATE)" :icon="CalendarClock" @select="followUpOpen = true">{{ $t('leads.followUp') }}</AppDropdownItem>
            <AppDropdownItem v-if="can(P.LEADS_DELETE)" :icon="Trash2" danger @select="confirmDelete">{{ $t('common.delete') }}</AppDropdownItem>
          </AppDropdown>
        </template>
      </DetailHeader>

      <div class="grid gap-4 lg:grid-cols-3">
        <div class="flex flex-col gap-4">
          <SectionCard v-if="l.status === 'CONVERTED'" :title="$t('leads.conversion')">
            <p class="mb-3 text-sm text-fg-muted">{{ $t('leads.convertedOn', { date: format.date(l.convertedAt ?? l.updatedAt) }) }}</p>
            <div class="flex flex-col gap-2">
              <AppButton v-if="l.convertedStudentId" variant="secondary" :icon="GraduationCap" :to="{ name: 'student', params: { id: l.convertedStudentId } }">{{ $t('leads.openStudent') }}</AppButton>
              <AppButton v-if="l.convertedFamilyId" variant="secondary" :icon="House" :to="{ name: 'family', params: { id: l.convertedFamilyId } }">{{ $t('leads.openFamily') }}</AppButton>
            </div>
          </SectionCard>

          <SectionCard :title="$t('leads.work')">
            <div class="flex flex-col gap-4">
              <div>
                <p class="mb-1.5 text-xs font-medium text-fg-muted">{{ $t('leads.assignee') }}</p>
                <AppSelect
                  v-if="can(P.LEADS_ASSIGN) && members.options.value.length && isOpen"
                  :model-value="l.assignedToId ?? ''"
                  :options="[{ value: '', label: $t('common.unassigned') }, ...members.options.value]"
                  :aria-label="$t('leads.assignee')"
                  @update:model-value="assign.mutate($event || null)"
                />
                <p v-else class="text-sm text-fg">{{ l.assignedTo?.name ?? $t('common.unassigned') }}</p>
                <AppButton
                  v-if="isOpen && can(P.LEADS_ASSIGN) && auth.profile && l.assignedToId !== auth.profile.id"
                  size="sm"
                  variant="ghost"
                  :icon="UserCheck"
                  class="mt-1"
                  @click="assign.mutate(auth.profile.id)"
                >
                  {{ $t('common.assignToMe') }}
                </AppButton>
              </div>
              <div>
                <p class="mb-1 text-xs font-medium text-fg-muted">{{ $t('leads.followUp') }}</p>
                <button
                  v-if="isOpen && can(P.LEADS_UPDATE)"
                  type="button"
                  class="focus-ring flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-sm hover:bg-surface-hover"
                  @click="followUpOpen = true"
                >
                  <CalendarClock class="size-4" :class="followUpOverdue ? 'text-danger' : 'text-fg-muted'" aria-hidden="true" />
                  <span :class="followUpOverdue ? 'font-medium text-danger' : 'text-fg'">
                    {{ l.nextFollowUpAt ? `${format.dateTime(l.nextFollowUpAt)} · ${format.relative(l.nextFollowUpAt)}` : $t('leads.setFollowUp') }}
                  </span>
                </button>
                <p v-else class="text-sm text-fg">{{ l.nextFollowUpAt ? format.dateTime(l.nextFollowUpAt) : '—' }}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard :title="$t('leads.contact')"><InfoList :items="contact" /></SectionCard>
        </div>

        <SectionCard :title="$t('leads.activities')" class="lg:col-span-2">
          <form v-if="can(P.LEADS_ACTIVITY_CREATE) && isOpen" class="mb-5 flex flex-col gap-3 rounded-2xl bg-surface-muted/60 p-3" @submit.prevent="addActivity.mutate()">
            <SegmentedControl
              :model-value="activityType"
              name="activity-type"
              :label="$t('leads.activityType')"
              :options="activityOptions"
              class="w-full overflow-x-auto"
              @update:model-value="activityType = $event as ActivityType"
            />
            <AppTextarea v-model="activityNote" :rows="2" :placeholder="$t('leads.activityPlaceholder')" :aria-label="$t('common.note')" />
            <AppButton type="submit" size="sm" class="self-end" :icon="Send" :loading="addActivity.isPending.value">{{ $t('leads.addActivity') }}</AppButton>
          </form>
          <EmptyState v-if="activities.data.value?.items.length === 0" compact :icon="MessageSquare" :text="$t('leads.noActivities')" />
          <ol v-else class="flex flex-col">
            <li v-for="item in activities.data.value?.items ?? l.recentActivities" :key="item.id" class="flex gap-3 border-b border-border py-3 last:border-0">
              <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="item.type === 'STATUS_CHANGED' ? 'bg-info' : 'bg-primary'" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-fg">
                  <strong class="font-medium">{{ $t(`leads.activityTypes.${item.type}`) }}</strong>
                  <template v-if="item.type === 'STATUS_CHANGED' && item.metadata && typeof item.metadata.to === 'string'">
                    → {{ $t(`status.lead.${item.metadata.to}`) }}
                  </template>
                </p>
                <p v-if="item.note" class="mt-0.5 text-sm whitespace-pre-line text-fg">{{ item.note }}</p>
                <p class="mt-0.5 text-xs text-fg-muted">{{ item.user?.name ?? $t('activity.system') }} · {{ format.dateTime(item.createdAt) }}</p>
              </div>
            </li>
          </ol>
        </SectionCard>
      </div>

      <LeadFormModal v-model:open="editing" :lead="l" />
      <LeadStatusModal v-model:open="statusOpen" :lead="l" />
      <FollowUpModal v-model:open="followUpOpen" :lead="l" />
      <ConvertLeadModal v-model:open="converting" :lead="l" />
    </div>
  </QueryState>
</template>

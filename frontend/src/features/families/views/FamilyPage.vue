<script setup lang="ts">
import { Pencil, Phone, Plus, Power } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import DetailHeader from '@/components/data/DetailHeader.vue';
import InfoList, { type InfoItem } from '@/components/data/InfoList.vue';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import AppAvatar from '@/components/ui/AppAvatar.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppTabs from '@/components/ui/AppTabs.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useRouteTab } from '@/composables/useRouteTab';
import ActivityTimeline from '@/features/audit/ActivityTimeline.vue';
import AccountFinance from '@/features/finance/components/AccountFinance.vue';
import StudentFormModal from '@/features/students/components/StudentFormModal.vue';
import { fullName } from '@/lib/people';
import FamilyFormModal from '../components/FamilyFormModal.vue';
import { useFamily, useSetFamilyActive } from '../queries';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const format = useFormatters();
const branches = useBranchOptions();
const detail = useFamily(() => props.id);
const setActive = useSetFamilyActive(() => props.id);
const family = computed(() => detail.data.value?.family);
const students = computed(() => detail.data.value?.students ?? []);

const tabs = computed(() => [
  { key: 'overview', label: t('families.tabs.overview') },
  ...(can(P.FINANCE_READ) ? [{ key: 'finance', label: t('families.tabs.finance') }] : []),
  ...(can(P.AUDIT_READ) ? [{ key: 'activity', label: t('families.tabs.activity') }] : []),
]);
const tab = useRouteTab(() => tabs.value.map((item) => item.key), 'overview');
const editing = ref(false);
const addingStudent = ref(false);

const contact = computed<InfoItem[]>(() =>
  family.value
    ? [
        { key: 'phone', label: t('common.phone'), value: family.value.phone },
        { key: 'secondaryPhone', label: t('families.secondaryPhone'), value: family.value.secondaryPhone },
        { key: 'email', label: t('common.email'), value: family.value.email },
        { key: 'address', label: t('common.address'), value: family.value.address },
        { key: 'branch', label: t('common.branch'), value: branches.nameOf(family.value.primaryBranchId) },
        { key: 'createdAt', label: t('common.createdAt'), value: format.date(family.value.createdAt) },
      ]
    : [],
);

async function toggleActive(): Promise<void> {
  if (!family.value) return;
  const deactivating = family.value.isActive;
  if (
    deactivating &&
    !(await confirm({
      title: t('families.deactivateTitle', { name: family.value.name }),
      message: t('families.deactivateText'),
      confirmLabel: t('common.deactivate'),
      danger: true,
    }))
  ) {
    return;
  }
  await setActive.mutateAsync(!deactivating).catch(() => undefined);
}
</script>

<template>
  <QueryState :loading="detail.isPending.value" :error="detail.error.value" loading-variant="page" @retry="detail.refetch()">
    <div v-if="family">
      <DetailHeader :title="family.name" :back="{ name: 'families' }" :back-label="$t('nav.families')">
        <template #badges>
          <StatusBadge kind="active" :value="family.isActive" />
          <span class="text-sm text-fg-muted">{{ $t('families.studentsCount', { count: students.length }, students.length) }}</span>
        </template>
        <template #actions>
          <AppButton variant="secondary" :icon="Phone" :href="`tel:${family.phone}`">{{ family.phone }}</AppButton>
          <AppButton v-if="can(P.FAMILIES_UPDATE)" variant="secondary" :icon="Pencil" @click="editing = true">{{ $t('common.edit') }}</AppButton>
          <AppButton
            v-if="can(family.isActive ? P.FAMILIES_DELETE : P.FAMILIES_UPDATE)"
            variant="ghost"
            :icon="Power"
            :loading="setActive.isPending.value"
            @click="toggleActive"
          >
            {{ family.isActive ? $t('common.deactivate') : $t('common.activate') }}
          </AppButton>
        </template>
      </DetailHeader>

      <AppTabs v-if="tabs.length > 1" v-model="tab" :tabs="tabs" :label="family.name" class="mb-5" />

      <div v-if="tab === 'overview'" class="grid gap-4 lg:grid-cols-3">
        <SectionCard :title="$t('families.students')" class="lg:col-span-2" flush>
          <template #actions>
            <AppButton v-if="can(P.STUDENTS_CREATE) && family.isActive" size="sm" variant="soft" :icon="Plus" @click="addingStudent = true">
              {{ $t('families.addStudent') }}
            </AppButton>
          </template>
          <EmptyState v-if="students.length === 0" compact :text="$t('families.noStudents')" />
          <ul v-else>
            <li v-for="student in students" :key="student.id" class="border-t border-border first:border-0">
              <RouterLink
                :to="{ name: 'student', params: { id: student.id } }"
                class="focus-ring flex items-center gap-3 px-5 py-3 hover:bg-surface-hover"
              >
                <AppAvatar :name="fullName(student)" size="sm" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-fg">{{ fullName(student) }}</span>
                  <span v-if="student.birthDate" class="block text-xs text-fg-muted">{{ format.day(student.birthDate) }}</span>
                </span>
                <StatusBadge kind="student" :value="student.status" />
              </RouterLink>
            </li>
          </ul>
        </SectionCard>
        <div class="flex flex-col gap-4">
          <SectionCard :title="$t('families.contact')"><InfoList :items="contact" /></SectionCard>
          <SectionCard v-if="family.notes" :title="$t('common.notes')">
            <p class="text-sm whitespace-pre-line text-fg">{{ family.notes }}</p>
          </SectionCard>
        </div>
      </div>

      <AccountFinance v-else-if="tab === 'finance'" :family="{ id: family.id, name: family.name }" />

      <SectionCard v-else-if="tab === 'activity'" :title="$t('families.tabs.activity')">
        <ActivityTimeline entity-type="Family" :entity-id="family.id" />
      </SectionCard>

      <FamilyFormModal v-model:open="editing" :family="family" />
      <StudentFormModal v-model:open="addingStudent" :family="{ id: family.id, name: family.name }" />
    </div>
  </QueryState>
</template>

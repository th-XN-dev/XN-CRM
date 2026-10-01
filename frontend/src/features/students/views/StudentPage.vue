<script setup lang="ts">
import { ArrowRightLeft, LogOut, MoreHorizontal, Pencil, RefreshCw, UserPlus } from 'lucide-vue-next';
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
import AppDropdown from '@/components/ui/AppDropdown.vue';
import AppDropdownItem from '@/components/ui/AppDropdownItem.vue';
import AppTabs from '@/components/ui/AppTabs.vue';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useRouteTab } from '@/composables/useRouteTab';
import ActivityTimeline from '@/features/audit/ActivityTimeline.vue';
import StudentAttendancePanel from '@/features/attendance/components/StudentAttendancePanel.vue';
import EnrollModal from '@/features/enrollments/components/EnrollModal.vue';
import EnrollmentHistory from '@/features/enrollments/components/EnrollmentHistory.vue';
import LeaveGroupModal from '@/features/enrollments/components/LeaveGroupModal.vue';
import TransferModal from '@/features/enrollments/components/TransferModal.vue';
import AccountFinance from '@/features/finance/components/AccountFinance.vue';
import { fullName, fullNameWithMiddle } from '@/lib/people';
import StudentFormModal from '../components/StudentFormModal.vue';
import StudentStatusModal from '../components/StudentStatusModal.vue';
import { useStudent, useStudentEnrollments } from '../queries';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const { can } = usePermission();
const format = useFormatters();
const student = useStudent(() => props.id);
const enrollments = useStudentEnrollments(() => props.id, () => can(P.ENROLLMENTS_READ));

const tabs = computed(() => [
  { key: 'overview', label: t('students.tabs.overview') },
  ...(can(P.ENROLLMENTS_READ) ? [{ key: 'groups', label: t('students.tabs.groups') }] : []),
  ...(can([P.ATTENDANCE_READ, P.ATTENDANCE_READ_OWN]) ? [{ key: 'attendance', label: t('students.tabs.attendance') }] : []),
  ...(can(P.FINANCE_READ) ? [{ key: 'finance', label: t('students.tabs.finance') }] : []),
  ...(can(P.AUDIT_READ) ? [{ key: 'activity', label: t('students.tabs.activity') }] : []),
]);
const tab = useRouteTab(() => tabs.value.map((item) => item.key), 'overview');

const editing = ref(false);
const changingStatus = ref(false);
const enrolling = ref(false);
const transferring = ref(false);
const leaving = ref(false);

const data = computed(() => student.data.value);
const name = computed(() => (data.value ? fullName(data.value) : ''));
const active = computed(() => data.value?.activeEnrollment ?? null);
const enrollmentRef = computed(() =>
  data.value && active.value
    ? {
        id: active.value.id,
        studentName: name.value,
        groupId: active.value.group.id,
        groupName: active.value.group.name,
      }
    : null,
);

const profile = computed<InfoItem[]>(() => {
  const s = data.value;
  if (!s) return [];
  return [
    { key: 'fullName', label: t('students.fullName'), value: fullNameWithMiddle(s) },
    { key: 'birthDate', label: t('students.birthDate'), value: s.birthDate ? format.day(s.birthDate) : null },
    { key: 'gender', label: t('students.gender'), value: s.gender ? t(s.gender === 'MALE' ? 'students.male' : 'students.female') : null },
    { key: 'phone', label: t('students.phone'), value: s.phone },
    { key: 'branch', label: t('common.branch'), value: s.branch.name },
    { key: 'joinedAt', label: t('students.joinedAt'), value: format.day(s.joinedAt) },
    ...(s.leftAt ? [{ key: 'leftAt', label: t('students.leftAt'), value: format.day(s.leftAt) }] : []),
  ];
});
</script>

<template>
  <QueryState :loading="student.isPending.value" :error="student.error.value" loading-variant="page" @retry="student.refetch()">
    <div v-if="data">
      <DetailHeader :title="name" :back="{ name: 'students' }" :back-label="$t('nav.students')">
        <template #leading><AppAvatar :name="name" size="lg" class="hidden sm:inline-flex" /></template>
        <template #badges>
          <StatusBadge kind="student" :value="data.status" />
          <RouterLink
            v-if="active"
            :to="{ name: 'group', params: { id: active.group.id } }"
            class="focus-ring rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-fg hover:bg-surface-hover"
          >{{ active.group.name }}</RouterLink>
          <span v-else-if="data.status === 'ACTIVE'" class="text-xs text-warning">{{ $t('students.noGroup') }}</span>
        </template>
        <template #actions>
          <AppButton v-if="!active && data.status === 'ACTIVE' && can(P.ENROLLMENTS_CREATE)" :icon="UserPlus" @click="enrolling = true">
            {{ $t('enrollments.enroll') }}
          </AppButton>
          <AppButton v-if="active && can(P.ENROLLMENTS_TRANSFER)" variant="secondary" :icon="ArrowRightLeft" @click="transferring = true">
            {{ $t('enrollments.transfer') }}
          </AppButton>
          <AppButton v-if="can(P.STUDENTS_UPDATE)" variant="secondary" :icon="Pencil" @click="editing = true">{{ $t('common.edit') }}</AppButton>
          <AppDropdown v-if="can([P.STUDENTS_UPDATE, P.ENROLLMENTS_CANCEL])" :label="$t('common.actions')">
            <template #trigger="{ toggle, open: isOpen, menuId }">
              <AppButton variant="secondary" icon-only :icon="MoreHorizontal" :label="$t('common.actions')" :aria-expanded="isOpen" :aria-controls="menuId" aria-haspopup="menu" @click="toggle" />
            </template>
            <AppDropdownItem v-if="can(P.STUDENTS_UPDATE)" :icon="RefreshCw" @select="changingStatus = true">{{ $t('students.changeStatus') }}</AppDropdownItem>
            <AppDropdownItem v-if="active && can(P.ENROLLMENTS_CANCEL)" :icon="LogOut" danger @select="leaving = true">{{ $t('enrollments.leave') }}</AppDropdownItem>
          </AppDropdown>
        </template>
      </DetailHeader>

      <AppTabs v-if="tabs.length > 1" v-model="tab" :tabs="tabs" :label="name" class="mb-5" />

      <div v-if="tab === 'overview'" class="grid gap-4 lg:grid-cols-3">
        <SectionCard :title="$t('students.profile')" class="lg:col-span-2">
          <InfoList :items="profile" :columns="2" />
        </SectionCard>
        <div class="flex flex-col gap-4">
          <SectionCard :title="$t('students.family')">
            <RouterLink :to="{ name: 'family', params: { id: data.familyId } }" class="focus-ring block rounded-lg font-medium text-fg hover:text-primary-text">
              {{ data.family.name }}
            </RouterLink>
            <a :href="`tel:${data.family.phone}`" class="text-sm text-fg-muted hover:text-primary-text">{{ data.family.phone }}</a>
          </SectionCard>
          <SectionCard :title="$t('students.currentGroup')">
            <template v-if="active">
              <RouterLink :to="{ name: 'group', params: { id: active.group.id } }" class="focus-ring block rounded-lg font-medium text-fg hover:text-primary-text">
                {{ active.group.name }}
              </RouterLink>
              <p class="text-sm text-fg-muted">{{ $t('students.since', { date: format.day(active.startedAt) }) }}</p>
            </template>
            <p v-else class="text-sm text-fg-muted">{{ $t('students.noGroup') }}</p>
          </SectionCard>
          <SectionCard v-if="data.notes" :title="$t('common.notes')">
            <p class="text-sm whitespace-pre-line text-fg">{{ data.notes }}</p>
          </SectionCard>
        </div>
      </div>

      <SectionCard v-else-if="tab === 'groups'" :title="$t('students.enrollmentHistory')">
        <EmptyState v-if="enrollments.data.value?.items.length === 0" compact :text="$t('students.noEnrollments')">
          <AppButton v-if="data.status === 'ACTIVE' && can(P.ENROLLMENTS_CREATE)" :icon="UserPlus" @click="enrolling = true">{{ $t('enrollments.enroll') }}</AppButton>
        </EmptyState>
        <EnrollmentHistory v-else :items="enrollments.data.value?.items ?? []" show="group" />
      </SectionCard>

      <StudentAttendancePanel v-else-if="tab === 'attendance'" :student-id="data.id" />

      <AccountFinance
        v-else-if="tab === 'finance'"
        :family="{ id: data.familyId, name: data.family.name }"
        :student="{ id: data.id, name }"
      />

      <SectionCard v-else-if="tab === 'activity'" :title="$t('students.tabs.activity')">
        <ActivityTimeline entity-type="Student" :entity-id="data.id" />
      </SectionCard>

      <StudentFormModal v-model:open="editing" :student="data" />
      <StudentStatusModal v-model:open="changingStatus" :student="{ id: data.id, name, status: data.status }" />
      <EnrollModal v-model:open="enrolling" :student="{ id: data.id, name }" />
      <TransferModal v-model:open="transferring" :enrollment="enrollmentRef" />
      <LeaveGroupModal v-model:open="leaving" :enrollment="enrollmentRef" />
    </div>
  </QueryState>
</template>

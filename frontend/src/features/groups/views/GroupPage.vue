<script setup lang="ts">
import {
  ArrowRightLeft,
  CalendarCheck,
  CheckCircle2,
  LogOut,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import CapacityBar from '@/components/data/CapacityBar.vue';
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
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useRouteTab } from '@/composables/useRouteTab';
import ActivityTimeline from '@/features/audit/ActivityTimeline.vue';
import AttendanceStats from '@/features/attendance/components/AttendanceStats.vue';
import { useGroupAttendanceStats, useRoster } from '@/features/attendance/queries';
import EnrollModal from '@/features/enrollments/components/EnrollModal.vue';
import EnrollmentHistory from '@/features/enrollments/components/EnrollmentHistory.vue';
import LeaveGroupModal from '@/features/enrollments/components/LeaveGroupModal.vue';
import TransferModal from '@/features/enrollments/components/TransferModal.vue';
import { useEnrollments } from '@/features/enrollments/queries';
import { orgDay, WEEK_DAYS } from '@/lib/dates';
import { fullName } from '@/lib/people';
import type { EnrollmentResponseDto, ScheduleResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { groupsApi, type GroupStatus } from '../api';
import GroupFormModal from '../components/GroupFormModal.vue';
import ScheduleSlotModal from '../components/ScheduleSlotModal.vue';
import { useGroup, useGroupSchedule } from '../queries';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const format = useFormatters();
const group = useGroup(() => props.id);
const g = computed(() => group.data.value);
const session = useSessionStore();

const tabs = computed(() => [
  { key: 'students', label: t('groups.tabs.students') },
  { key: 'schedule', label: t('groups.tabs.schedule') },
  ...(can([P.ATTENDANCE_READ, P.ATTENDANCE_READ_OWN]) ? [{ key: 'attendance', label: t('groups.tabs.attendance') }] : []),
  ...(can(P.ENROLLMENTS_READ) ? [{ key: 'history', label: t('groups.tabs.history') }] : []),
  ...(can(P.AUDIT_READ) ? [{ key: 'activity', label: t('groups.tabs.activity') }] : []),
]);
const tab = useRouteTab(() => tabs.value.map((item) => item.key), 'students');

const roster = useEnrollments(
  () => ({ groupId: props.id, status: 'ACTIVE', limit: 100, sortBy: 'startedAt', sortOrder: 'asc' }),
  () => can(P.ENROLLMENTS_READ),
);
/** Teachers (no enrollments.read) see their group's students through today's roster. */
const teacherRoster = useRoster(
  () => (can(P.ENROLLMENTS_READ) ? '' : props.id),
  () => orgDay(session.organization?.timezone),
);
const history = useEnrollments(
  () => ({ groupId: props.id, limit: 100, sortBy: 'startedAt', sortOrder: 'desc' }),
  () => tab.value === 'history',
);
const schedule = useGroupSchedule(() => props.id);
const stats = useGroupAttendanceStats(() => props.id);
const slots = computed(() =>
  [...(schedule.data.value?.items ?? [])].sort(
    (a, b) => WEEK_DAYS.indexOf(a.dayOfWeek) - WEEK_DAYS.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime),
  ),
);
const students = computed(() =>
  [...(roster.data.value?.items ?? [])].sort((a, b) => fullName(a.student).localeCompare(fullName(b.student))),
);
const running = computed(() => g.value?.status === 'ACTIVE' || g.value?.status === 'PAUSED');
const seatsLeft = computed(() => Math.max((g.value?.capacity ?? 0) - (g.value?.enrolledCount ?? 0), 0));

const editing = ref(false);
const enrolling = ref(false);
const slotOpen = ref(false);
const editedSlot = ref<ScheduleResponseDto | null>(null);
const transferOpen = ref(false);
const leaveOpen = ref(false);
const picked = ref<{ id: string; studentName: string; groupId: string; groupName: string } | null>(null);

function pick(enrollment: EnrollmentResponseDto, action: 'transfer' | 'leave'): void {
  picked.value = { id: enrollment.id, studentName: fullName(enrollment.student), groupId: props.id, groupName: g.value?.name ?? '' };
  if (action === 'transfer') transferOpen.value = true;
  else leaveOpen.value = true;
}
function openSlot(slot: ScheduleResponseDto | null): void {
  editedSlot.value = slot;
  slotOpen.value = true;
}

const setStatus = useApiMutation({
  fn: (status: GroupStatus) => (status === 'CANCELLED' ? groupsApi.cancel(props.id) : groupsApi.update(props.id, { status })),
  invalidates: [['groups'], ['schedules'], ['dashboard']],
  success: (updated) => t('groups.statusChanged', { status: t(`status.group.${updated.status}`) }),
  toastError: true,
});
const removeSlot = useApiMutation({
  fn: (id: string) => groupsApi.removeSchedule(id),
  invalidates: [['schedules']],
  success: t('schedule.slotRemoved'),
  toastError: true,
});

async function changeStatus(status: GroupStatus): Promise<void> {
  if (status === 'COMPLETED' || status === 'CANCELLED') {
    const ok = await confirm({
      title: t(`groups.confirm.${status}.title`, { name: g.value?.name ?? '' }),
      message: t(`groups.confirm.${status}.text`),
      confirmLabel: t(`groups.actions.${status}`),
      danger: status === 'CANCELLED',
    });
    if (!ok) return;
  }
  setStatus.mutate(status);
}
async function deleteSlot(slot: ScheduleResponseDto): Promise<void> {
  const ok = await confirm({
    title: t('schedule.removeTitle'),
    message: `${t(`schedule.days.${slot.dayOfWeek}`)} ${slot.startTime}–${slot.endTime}`,
    confirmLabel: t('common.remove'),
    danger: true,
  });
  if (ok) removeSlot.mutate(slot.id);
}

const overview = computed<InfoItem[]>(() => {
  const data = g.value;
  if (!data) return [];
  return [
    { key: 'course', label: t('groups.course'), value: data.course.name },
    { key: 'level', label: t('groups.level'), value: data.level?.name },
    { key: 'teacher', label: t('groups.teacher'), value: data.teacher ? fullName(data.teacher) : t('groups.noTeacher') },
    { key: 'room', label: t('groups.room'), value: data.room?.name ?? t('groups.noRoom') },
    { key: 'price', label: t('groups.monthlyPrice'), value: format.money(data.monthlyPrice) },
    { key: 'dates', label: t('groups.period'), value: `${format.day(data.startDate)} — ${data.endDate ? format.day(data.endDate) : '…'}` },
    { key: 'branch', label: t('common.branch'), value: data.branch.name },
  ];
});
</script>

<template>
  <QueryState :loading="group.isPending.value" :error="group.error.value" loading-variant="page" @retry="group.refetch()">
    <div v-if="g">
      <DetailHeader :title="g.name" :subtitle="[g.course.name, g.level?.name].filter(Boolean).join(' · ')" :back="{ name: 'groups' }" :back-label="$t('nav.groups')">
        <template #badges>
          <StatusBadge kind="group" :value="g.status" />
          <CapacityBar :used="g.enrolledCount" :total="g.capacity" class="w-44" />
        </template>
        <template #actions>
          <AppButton v-if="running && can([P.ATTENDANCE_MARK, P.ATTENDANCE_MARK_OWN])" :icon="CalendarCheck" :to="{ name: 'attendance', query: { groupId: g.id } }">
            {{ $t('attendance.mark') }}
          </AppButton>
          <AppButton v-if="g.status === 'ACTIVE' && can(P.ENROLLMENTS_CREATE)" variant="secondary" :icon="UserPlus" :disabled="seatsLeft === 0" @click="enrolling = true">
            {{ $t('groups.addStudent') }}
          </AppButton>
          <AppButton v-if="can(P.GROUPS_UPDATE) && running" variant="secondary" :icon="Pencil" @click="editing = true">{{ $t('common.edit') }}</AppButton>
          <AppDropdown v-if="can([P.GROUPS_UPDATE, P.GROUPS_DELETE]) && running" :label="$t('common.actions')">
            <template #trigger="{ toggle, open: isOpen, menuId }">
              <AppButton variant="secondary" icon-only :icon="MoreHorizontal" :label="$t('common.actions')" :aria-expanded="isOpen" :aria-controls="menuId" aria-haspopup="menu" @click="toggle" />
            </template>
            <AppDropdownItem v-if="g.status === 'ACTIVE' && can(P.GROUPS_UPDATE)" :icon="Pause" @select="changeStatus('PAUSED')">{{ $t('groups.actions.PAUSED') }}</AppDropdownItem>
            <AppDropdownItem v-if="g.status === 'PAUSED' && can(P.GROUPS_UPDATE)" :icon="Play" @select="changeStatus('ACTIVE')">{{ $t('groups.actions.ACTIVE') }}</AppDropdownItem>
            <AppDropdownItem v-if="can(P.GROUPS_UPDATE)" :icon="CheckCircle2" @select="changeStatus('COMPLETED')">{{ $t('groups.actions.COMPLETED') }}</AppDropdownItem>
            <AppDropdownItem v-if="can(P.GROUPS_DELETE)" :icon="XCircle" danger @select="changeStatus('CANCELLED')">{{ $t('groups.actions.CANCELLED') }}</AppDropdownItem>
          </AppDropdown>
        </template>
      </DetailHeader>

      <div class="grid gap-4 lg:grid-cols-3">
        <div class="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <AppTabs v-model="tab" :tabs="tabs" :label="g.name" />

          <SectionCard v-if="tab === 'students'" :title="$t('groups.studentsTitle', { count: g.enrolledCount })" flush>
            <ul v-if="!can(P.ENROLLMENTS_READ)">
              <li v-for="entry in teacherRoster.data.value?.students ?? []" :key="entry.enrollment.id" class="flex items-center gap-3 border-t border-border px-5 py-3 first:border-0">
                <AppAvatar :name="fullName(entry.student)" size="sm" />
                <RouterLink :to="{ name: 'student', params: { id: entry.student.id } }" class="focus-ring min-w-0 flex-1 truncate rounded font-medium text-fg hover:text-primary-text">
                  {{ fullName(entry.student) }}
                </RouterLink>
              </li>
            </ul>
            <EmptyState v-else-if="roster.data.value && students.length === 0" compact :text="$t('groups.noStudents')">
              <AppButton v-if="g.status === 'ACTIVE' && can(P.ENROLLMENTS_CREATE)" :icon="UserPlus" @click="enrolling = true">{{ $t('groups.addStudent') }}</AppButton>
            </EmptyState>
            <ul v-else>
              <li v-for="enrollment in students" :key="enrollment.id" class="flex items-center gap-3 border-t border-border px-5 py-3 first:border-0">
                <AppAvatar :name="fullName(enrollment.student)" size="sm" />
                <RouterLink :to="{ name: 'student', params: { id: enrollment.studentId } }" class="focus-ring min-w-0 flex-1 rounded">
                  <span class="block truncate font-medium text-fg hover:text-primary-text">{{ fullName(enrollment.student) }}</span>
                  <span class="block text-xs text-fg-muted">{{ $t('students.since', { date: format.day(enrollment.startedAt) }) }}</span>
                </RouterLink>
                <div class="flex shrink-0">
                  <AppButton v-if="can(P.ENROLLMENTS_TRANSFER)" variant="ghost" size="sm" icon-only :icon="ArrowRightLeft" :label="$t('enrollments.transfer')" @click="pick(enrollment, 'transfer')" />
                  <AppButton v-if="can(P.ENROLLMENTS_CANCEL)" variant="ghost" size="sm" icon-only :icon="LogOut" :label="$t('enrollments.leave')" @click="pick(enrollment, 'leave')" />
                </div>
              </li>
            </ul>
          </SectionCard>

          <SectionCard v-else-if="tab === 'schedule'" :title="$t('groups.weekly')" flush>
            <template #actions>
              <AppButton v-if="running && can(P.SCHEDULES_MANAGE)" size="sm" variant="soft" :icon="Plus" @click="openSlot(null)">{{ $t('schedule.addSlot') }}</AppButton>
            </template>
            <EmptyState v-if="schedule.data.value && slots.length === 0" compact :text="$t('schedule.noSlots')" />
            <ul v-else>
              <li v-for="slot in slots" :key="slot.id" class="flex items-center gap-3 border-t border-border px-5 py-3 first:border-0">
                <span class="w-28 shrink-0 text-sm font-medium text-fg">{{ $t(`schedule.days.${slot.dayOfWeek}`) }}</span>
                <span class="flex-1 text-sm text-fg tabular-nums">{{ slot.startTime }}–{{ slot.endTime }}<span v-if="slot.room" class="text-fg-muted"> · {{ slot.room.name }}</span></span>
                <template v-if="can(P.SCHEDULES_MANAGE) && running">
                  <AppButton variant="ghost" size="sm" icon-only :icon="Pencil" :label="$t('common.edit')" @click="openSlot(slot)" />
                  <AppButton variant="ghost" size="sm" icon-only :icon="Trash2" :label="$t('common.remove')" @click="deleteSlot(slot)" />
                </template>
              </li>
            </ul>
          </SectionCard>

          <SectionCard v-else-if="tab === 'attendance'" :title="$t('groups.attendanceTitle')">
            <AttendanceStats
              v-if="stats.data.value"
              :rate="stats.data.value.averageAttendance"
              :present="stats.data.value.present"
              :absent="stats.data.value.absent"
              :late="stats.data.value.late"
              :excused="stats.data.value.excused"
              :lessons="stats.data.value.lessonsCount"
            />
          </SectionCard>

          <SectionCard v-else-if="tab === 'activity'" :title="$t('groups.tabs.activity')">
            <ActivityTimeline entity-type="Group" :entity-id="g.id" />
          </SectionCard>

          <SectionCard v-else-if="tab === 'history'" :title="$t('groups.tabs.history')">
            <EmptyState v-if="history.data.value?.items.length === 0" compact :text="$t('groups.noHistory')" />
            <EnrollmentHistory v-else :items="history.data.value?.items ?? []" show="student" />
          </SectionCard>
        </div>

        <SectionCard :title="$t('groups.overview')" class="lg:order-none">
          <InfoList :items="overview">
            <template #item-teacher>
              <RouterLink v-if="g.teacher" :to="{ name: 'teacher', params: { id: g.teacher.id } }" class="text-primary-text hover:underline">{{ fullName(g.teacher) }}</RouterLink>
              <span v-else class="text-warning">{{ $t('groups.noTeacher') }}</span>
            </template>
            <template #item-course>
              <RouterLink :to="{ name: 'course', params: { id: g.course.id } }" class="text-primary-text hover:underline">{{ g.course.name }}</RouterLink>
            </template>
          </InfoList>
        </SectionCard>
      </div>

      <GroupFormModal v-model:open="editing" :group="g" />
      <EnrollModal v-model:open="enrolling" :group="{ id: g.id, name: g.name, seatsLeft }" />
      <TransferModal v-model:open="transferOpen" :enrollment="picked" />
      <LeaveGroupModal v-model:open="leaveOpen" :enrollment="picked" />
      <ScheduleSlotModal v-model:open="slotOpen" :group="{ id: g.id, branchId: g.branchId, roomId: g.roomId }" :schedule="editedSlot" />
    </div>
  </QueryState>
</template>

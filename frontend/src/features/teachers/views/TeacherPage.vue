<script setup lang="ts">
import { Pencil, Phone, Power } from 'lucide-vue-next';
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
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import AttendanceStats from '@/features/attendance/components/AttendanceStats.vue';
import { useTimetable } from '@/features/groups/queries';
import WeekTimetable from '@/features/schedule/components/WeekTimetable.vue';
import { orgDay, weekDayOf } from '@/lib/dates';
import { fullName } from '@/lib/people';
import { useApiMutation, useApiQuery } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { teachersApi } from '../api';
import TeacherFormModal from '../components/TeacherFormModal.vue';
import { useTeacher } from '../queries';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const format = useFormatters();
const session = useSessionStore();
const teacher = useTeacher(() => props.id);
const timetable = useTimetable(() => ({ teacherId: props.id }));
const attendance = useApiQuery({
  key: () => ['reports', 'teacher-attendance', props.id],
  fn: () => teachersApi.attendance(props.id),
  enabled: () => can(P.REPORTS_ACADEMIC_READ),
});
const editing = ref(false);
const today = computed(() => weekDayOf(orgDay(session.organization?.timezone)));
const name = computed(() => (teacher.data.value ? fullName(teacher.data.value) : ''));
const running = computed(() => teacher.data.value?.groups.filter((g) => g.status === 'ACTIVE' || g.status === 'PAUSED') ?? []);

const profile = computed<InfoItem[]>(() => {
  const data = teacher.data.value;
  if (!data) return [];
  return [
    { key: 'phone', label: t('common.phone'), value: data.phone },
    { key: 'branch', label: t('common.branch'), value: data.branch.name },
    { key: 'account', label: t('teachers.account'), value: data.userId ? t('teachers.hasAccount') : t('teachers.noAccount') },
    { key: 'since', label: t('common.createdAt'), value: format.date(data.createdAt) },
    { key: 'notes', label: t('common.notes'), value: data.notes },
  ];
});

const setActive = useApiMutation({
  fn: (active: boolean) => (active ? teachersApi.update(props.id, { status: 'ACTIVE' }) : teachersApi.deactivate(props.id)),
  invalidates: [['teachers'], ['groups']],
  toastError: true,
});
async function toggle(): Promise<void> {
  const data = teacher.data.value;
  if (!data) return;
  const deactivating = data.status === 'ACTIVE';
  if (deactivating && !(await confirm({ title: t('teachers.deactivateTitle', { name: name.value }), message: t('teachers.deactivateText'), danger: true, confirmLabel: t('common.deactivate') }))) return;
  await setActive.mutateAsync(!deactivating).catch(() => undefined);
}
</script>

<template>
  <QueryState :loading="teacher.isPending.value" :error="teacher.error.value" loading-variant="page" @retry="teacher.refetch()">
    <div v-if="teacher.data.value" class="flex flex-col gap-4">
      <DetailHeader :title="name" :back="{ name: 'teachers' }" :back-label="$t('nav.teachers')" class="!mb-2">
        <template #leading><AppAvatar :name="name" size="lg" class="hidden sm:inline-flex" /></template>
        <template #badges>
          <StatusBadge kind="teacher" :value="teacher.data.value.status" />
          <span class="text-sm text-fg-muted">{{ $t('teachers.groupsCount', { count: running.length }, running.length) }}</span>
        </template>
        <template #actions>
          <AppButton v-if="teacher.data.value.phone" variant="secondary" :icon="Phone" :href="`tel:${teacher.data.value.phone}`">{{ teacher.data.value.phone }}</AppButton>
          <AppButton v-if="can(P.TEACHERS_UPDATE)" variant="secondary" :icon="Pencil" @click="editing = true">{{ $t('common.edit') }}</AppButton>
          <AppButton v-if="can(teacher.data.value.status === 'ACTIVE' ? P.TEACHERS_DELETE : P.TEACHERS_UPDATE)" variant="ghost" :icon="Power" :loading="setActive.isPending.value" @click="toggle">
            {{ teacher.data.value.status === 'ACTIVE' ? $t('common.deactivate') : $t('common.activate') }}
          </AppButton>
        </template>
      </DetailHeader>

      <div class="grid gap-4 lg:grid-cols-3">
        <SectionCard :title="$t('students.profile')"><InfoList :items="profile" /></SectionCard>
        <SectionCard :title="$t('teachers.groups')" class="lg:col-span-2" flush>
          <EmptyState v-if="teacher.data.value.groups.length === 0" compact :text="$t('teachers.noGroups')" />
          <ul v-else>
            <li v-for="group in teacher.data.value.groups" :key="group.id" class="border-t border-border first:border-0">
              <RouterLink :to="{ name: 'group', params: { id: group.id } }" class="focus-ring flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover">
                <span class="truncate font-medium text-fg">{{ group.name }}</span>
                <StatusBadge kind="group" :value="group.status" />
              </RouterLink>
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard v-if="attendance.data.value" :title="$t('teachers.attendanceMonth')">
        <AttendanceStats
          :rate="attendance.data.value.totalMarks ? attendance.data.value.attendanceRate : null"
          :present="attendance.data.value.present"
          :absent="attendance.data.value.absent"
          :late="attendance.data.value.late"
          :excused="attendance.data.value.excused"
          :lessons="attendance.data.value.totalLessons"
        />
      </SectionCard>

      <section>
        <h2 class="mb-3 text-base font-semibold text-fg">{{ $t('nav.schedule') }}</h2>
        <WeekTimetable :slots="timetable.data.value ?? []" :today="today" :hide="['teacher']" />
      </section>

      <TeacherFormModal v-model:open="editing" :teacher="teacher.data.value" />
    </div>
  </QueryState>
</template>

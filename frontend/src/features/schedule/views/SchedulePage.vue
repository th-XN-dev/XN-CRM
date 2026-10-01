<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { P } from '@/app/config/permissions';
import FilterSelect from '@/components/data/FilterSelect.vue';
import ListToolbar from '@/components/data/ListToolbar.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { usePermission } from '@/composables/usePermission';
import { useGroupOptions, useTimetable } from '@/features/groups/queries';
import { useRoomOptions } from '@/features/rooms/api';
import { useTeacherOptions } from '@/features/teachers/queries';
import { orgDay, WEEK_DAYS, weekDayOf, type WeekDay } from '@/lib/dates';
import { useListState } from '@/services/query/useListState';
import { useSessionStore } from '@/stores/session.store';
import WeekTimetable from '../components/WeekTimetable.vue';

const { t } = useI18n();
const { can } = usePermission();
const session = useSessionStore();
const branches = useBranchOptions();
const today = computed(() => weekDayOf(orgDay(session.organization?.timezone)));
const list = useListState(
  { view: 'week', day: '', teacherId: '', roomId: '', groupId: '', branchId: '' },
  ['teacherId', 'roomId', 'groupId', 'branchId'],
);
const timetable = useTimetable(() => ({
  teacherId: list.state.teacherId || undefined,
  roomId: list.state.roomId || undefined,
  groupId: list.state.groupId || undefined,
  branchId: list.state.branchId || undefined,
}));
const teachers = useTeacherOptions(() => can(P.TEACHERS_READ));
const rooms = useRoomOptions(() => can(P.ROOMS_READ));
const groups = useGroupOptions();

const day = computed<WeekDay>(() => (WEEK_DAYS as readonly string[]).includes(list.state.day) ? (list.state.day as WeekDay) : today.value);
const viewOptions = computed(() => [
  { value: 'week', label: t('schedule.week') },
  { value: 'day', label: t('schedule.dayView') },
]);
const dayOptions = computed(() => WEEK_DAYS.map((value) => ({ value, label: t(`schedule.daysShort.${value}`) })));
const lessonsCount = computed(() => timetable.data.value?.length ?? 0);
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.schedule')" :description="$t('schedule.subtitle', { count: lessonsCount }, lessonsCount)">
      <template #actions>
        <SegmentedControl :model-value="list.state.view" name="schedule-view" :label="$t('schedule.view')" :options="viewOptions" @update:model-value="list.set({ view: $event })" />
      </template>
    </PageHeader>

    <ListToolbar :active-filters="list.activeFilters.value" @reset="list.set({ teacherId: '', roomId: '', groupId: '', branchId: '' })">
      <template #filters>
        <FilterSelect v-if="teachers.options.value.length" :model-value="list.state.teacherId" :label="$t('groups.teacher')" :options="teachers.options.value" @update:model-value="list.set({ teacherId: $event })" />
        <FilterSelect v-if="rooms.options.value.length" :model-value="list.state.roomId" :label="$t('groups.room')" :options="rooms.options.value" @update:model-value="list.set({ roomId: $event })" />
        <FilterSelect v-if="groups.options.value.length" :model-value="list.state.groupId" :label="$t('enrollments.group')" :options="groups.options.value" @update:model-value="list.set({ groupId: $event })" />
        <FilterSelect v-if="branches.showFilter.value" :model-value="list.state.branchId" :label="$t('common.branch')" :options="branches.options.value" @update:model-value="list.set({ branchId: $event })" />
      </template>
    </ListToolbar>

    <SegmentedControl
      v-if="list.state.view === 'day'"
      :model-value="day"
      name="schedule-day"
      :label="$t('schedule.day')"
      :options="dayOptions"
      class="mb-4 w-full overflow-x-auto"
      @update:model-value="list.set({ day: $event })"
    />

    <QueryState :loading="timetable.isPending.value" :error="timetable.error.value" loading-variant="cards" @retry="timetable.refetch()">
      <WeekTimetable :slots="timetable.data.value ?? []" :today="today" :days="list.state.view === 'day' ? [day] : undefined" />
    </QueryState>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SectionCard from '@/components/data/SectionCard.vue';
import StatusBadge from '@/components/data/StatusBadge.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import AppPagination from '@/components/ui/AppPagination.vue';
import { useFormatters } from '@/composables/useFormatters';
import { useStudentAttendance, useStudentAttendanceStats } from '../queries';
import AttendanceStats from './AttendanceStats.vue';

/** A student's attendance: overall rate and counts, then lesson by lesson. */
const props = defineProps<{ studentId: string }>();
const format = useFormatters();
const page = ref(1);
const stats = useStudentAttendanceStats(() => props.studentId);
const history = useStudentAttendance(() => props.studentId, page);
</script>

<template>
  <div class="flex flex-col gap-4">
    <SectionCard>
      <AttendanceStats
        v-if="stats.data.value"
        :rate="stats.data.value.attendancePercentage"
        :present="stats.data.value.present"
        :absent="stats.data.value.absent"
        :late="stats.data.value.late"
        :excused="stats.data.value.excused"
        :lessons="stats.data.value.totalLessons"
      />
      <div v-else class="h-20 animate-pulse rounded-xl bg-surface-muted" />
    </SectionCard>
    <SectionCard :title="$t('attendance.history')">
      <EmptyState v-if="history.data.value?.meta.total === 0" compact :text="$t('attendance.noMarks')" />
      <ul v-else class="flex flex-col">
        <li v-for="item in history.data.value?.items ?? []" :key="item.id" class="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
          <div class="min-w-0">
            <p class="text-sm font-medium text-fg">{{ format.day(item.date) }} <span class="font-normal text-fg-muted">· {{ format.weekday(item.date) }}</span></p>
            <p class="truncate text-xs text-fg-muted">{{ item.group.name }}<template v-if="item.note"> · {{ item.note }}</template></p>
          </div>
          <StatusBadge kind="attendance" :value="item.status" />
        </li>
      </ul>
      <AppPagination v-if="(history.data.value?.meta.totalPages ?? 0) > 1" v-model="page" :meta="history.data.value!.meta" class="mt-3" />
    </SectionCard>
  </div>
</template>

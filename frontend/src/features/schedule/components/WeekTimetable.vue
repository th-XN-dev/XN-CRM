<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core';
import { DoorOpen, UserRound } from 'lucide-vue-next';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { WEEK_DAYS, type WeekDay } from '@/lib/dates';
import { fullName } from '@/lib/people';
import type { TimetableSlotDto } from '@/services/api/schema.gen';

/**
 * The week at a glance. Desktop: seven columns, lessons stacked by time.
 * Phone: one compact list per day ("09:00 — Foundation A"). `today` is
 * highlighted; empty days collapse on phones.
 */
const props = defineProps<{
  slots: readonly TimetableSlotDto[];
  today?: WeekDay;
  /** Hide what the page already fixes (e.g. the teacher on the teacher's page). */
  hide?: readonly ('teacher' | 'room' | 'group')[];
  /** Only these days (the "Day" view). */
  days?: readonly WeekDay[];
}>();
const desktop = useMediaQuery('(min-width: 1024px)');
const shown = (part: 'teacher' | 'room' | 'group') => !props.hide?.includes(part);

const byDay = computed(() =>
  (props.days ?? WEEK_DAYS).map((day) => ({ day, slots: props.slots.filter((slot) => slot.dayOfWeek === day) })),
);
</script>

<template>
  <div v-if="desktop && (days?.length ?? 7) > 1" class="grid grid-cols-7 gap-2">
    <section
      v-for="column in byDay"
      :key="column.day"
      class="flex min-h-40 flex-col gap-2 rounded-2xl border p-2"
      :class="column.day === today ? 'border-primary/40 bg-primary-soft/40' : 'border-border bg-surface'"
      :aria-label="$t(`schedule.days.${column.day}`)"
    >
      <h3 class="px-1.5 pt-1 text-xs font-semibold tracking-wide uppercase" :class="column.day === today ? 'text-primary-text' : 'text-fg-muted'">
        {{ $t(`schedule.daysShort.${column.day}`) }}
      </h3>
      <RouterLink
        v-for="slot in column.slots"
        :key="slot.id"
        :to="{ name: 'group', params: { id: slot.group.id }, query: { tab: 'schedule' } }"
        class="focus-ring block rounded-xl border-l-4 border-primary bg-surface-muted px-2.5 py-2 text-xs transition-colors hover:bg-surface-hover"
      >
        <span class="block font-semibold text-fg tabular-nums">{{ slot.startTime }}–{{ slot.endTime }}</span>
        <span v-if="shown('group')" class="block truncate font-medium text-fg">{{ slot.group.name }}</span>
        <span v-if="shown('teacher') && slot.group.teacher" class="block truncate text-fg-muted">{{ fullName(slot.group.teacher) }}</span>
        <span v-if="shown('room') && slot.room" class="block truncate text-fg-muted">{{ slot.room.name }}</span>
      </RouterLink>
    </section>
  </div>

  <div v-else class="flex flex-col gap-3">
    <template v-for="column in byDay" :key="column.day">
      <section v-if="column.slots.length || column.day === today" class="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <h3 class="mb-2 flex items-center gap-2 text-sm font-semibold" :class="column.day === today ? 'text-primary-text' : 'text-fg'">
          {{ $t(`schedule.days.${column.day}`) }}
          <span v-if="column.day === today" class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium">{{ $t('schedule.today') }}</span>
        </h3>
        <p v-if="!column.slots.length" class="text-sm text-fg-muted">{{ $t('schedule.noLessons') }}</p>
        <ul class="flex flex-col">
          <li v-for="slot in column.slots" :key="slot.id" class="border-t border-border first:border-0">
            <RouterLink :to="{ name: 'group', params: { id: slot.group.id }, query: { tab: 'schedule' } }" class="focus-ring flex items-start gap-3 rounded-lg py-2.5">
              <span class="w-12 shrink-0 font-semibold text-fg tabular-nums">{{ slot.startTime }}</span>
              <span class="min-w-0 flex-1">
                <span v-if="shown('group')" class="block truncate font-medium text-fg">{{ slot.group.name }}</span>
                <span class="flex flex-wrap gap-x-3 text-xs text-fg-muted">
                  <span>{{ slot.startTime }}–{{ slot.endTime }}</span>
                  <span v-if="shown('teacher') && slot.group.teacher" class="inline-flex items-center gap-1"><UserRound class="size-3" aria-hidden="true" />{{ fullName(slot.group.teacher) }}</span>
                  <span v-if="shown('room') && slot.room" class="inline-flex items-center gap-1"><DoorOpen class="size-3" aria-hidden="true" />{{ slot.room.name }}</span>
                </span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
    <p v-if="slots.length === 0 && !today" class="py-8 text-center text-sm text-fg-muted">{{ $t('schedule.noLessons') }}</p>
  </div>
</template>

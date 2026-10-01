<script setup lang="ts">
import { CheckCheck, Clock, Save } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave } from 'vue-router';
import { P } from '@/app/config/permissions';
import EmptyState from '@/components/feedback/EmptyState.vue';
import QueryState from '@/components/feedback/QueryState.vue';
import FormError from '@/components/forms/FormError.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppAvatar from '@/components/ui/AppAvatar.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { useConfirm } from '@/composables/useConfirm';
import { useFormatters } from '@/composables/useFormatters';
import { usePermission } from '@/composables/usePermission';
import { useGroupOptions, useTimetable } from '@/features/groups/queries';
import { orgDay, weekDayOf } from '@/lib/dates';
import { fullName } from '@/lib/people';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useListState } from '@/services/query/useListState';
import { useSessionStore } from '@/stores/session.store';
import { attendanceApi, ATTENDANCE_STATUSES, type AttendanceStatus } from '../api';
import { useRoster } from '../queries';

/**
 * Teacher flow: pick today's lesson (or any group and date) → one tap per
 * student → Save. Everything is saved in one request; unsaved changes are
 * guarded when leaving.
 */
const { t } = useI18n();
const { can } = usePermission();
const confirm = useConfirm();
const format = useFormatters();
const session = useSessionStore();
const today = computed(() => orgDay(session.organization?.timezone));
const list = useListState({ groupId: '', date: '' });
const date = computed(() => list.state.date || today.value);
const groups = useGroupOptions();
const todays = useTimetable({});
const lessonsToday = computed(() => (todays.data.value ?? []).filter((slot) => slot.dayOfWeek === weekDayOf(today.value)));
const roster = useRoster(() => list.state.groupId, date);
const canMark = computed(() => can([P.ATTENDANCE_MARK, P.ATTENDANCE_MARK_OWN]));
const marks = reactive<Record<string, AttendanceStatus>>({});
const saved = ref<Record<string, AttendanceStatus>>({});
const error = ref<string | null>(null);

watch(
  () => roster.data.value,
  (data) => {
    for (const key of Object.keys(marks)) delete marks[key];
    const initial: Record<string, AttendanceStatus> = {};
    for (const entry of data?.students ?? []) {
      if (entry.attendance) initial[entry.enrollment.id] = entry.attendance.status;
    }
    Object.assign(marks, initial);
    saved.value = { ...initial };
    error.value = null;
  },
  { immediate: true },
);

const students = computed(() =>
  [...(roster.data.value?.students ?? [])].sort((a, b) => fullName(a.student).localeCompare(fullName(b.student))),
);
const changed = computed(() => Object.entries(marks).filter(([id, status]) => saved.value[id] !== status).length);
const unmarked = computed(() => students.value.filter((entry) => !marks[entry.enrollment.id]).length);
const counts = computed(() =>
  Object.fromEntries(ATTENDANCE_STATUSES.map((status) => [status, Object.values(marks).filter((m) => m === status).length])),
);

const tones: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success text-white',
  ABSENT: 'bg-danger text-white',
  LATE: 'bg-warning text-black',
  EXCUSED: 'bg-info text-white',
};

function markAll(): void {
  for (const entry of students.value) if (!marks[entry.enrollment.id]) marks[entry.enrollment.id] = 'PRESENT';
}

const save = useApiMutation({
  fn: () =>
    attendanceApi.mark(list.state.groupId, {
      date: date.value,
      records: Object.entries(marks).map(([enrollmentId, status]) => ({ enrollmentId, status })),
    }),
  invalidates: [['attendance'], ['dashboard']],
  success: () => t('attendance.saved'),
  onSuccess: () => {
    saved.value = { ...marks };
  },
});

async function submit(): Promise<void> {
  error.value = null;
  try {
    await save.mutateAsync();
  } catch (failure) {
    error.value = apiErrorMessage(failure);
  }
}

async function leaveIfClean(): Promise<boolean> {
  if (changed.value === 0) return true;
  return confirm({ title: t('attendance.unsavedTitle'), message: t('attendance.unsavedText'), confirmLabel: t('attendance.discard'), danger: true });
}
async function choose(patch: { groupId?: string; date?: string }): Promise<void> {
  if (await leaveIfClean()) list.set(patch);
}
onBeforeRouteLeave(leaveIfClean);
</script>

<template>
  <div :class="changed > 0 && 'pb-24 md:pb-0'">
    <PageHeader :title="$t('nav.attendance')" :description="$t('attendance.subtitle')" />

    <section v-if="!list.state.groupId && lessonsToday.length" class="mb-6">
      <h2 class="mb-3 text-sm font-semibold text-fg-muted">{{ $t('attendance.todayLessons') }}</h2>
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="slot in lessonsToday" :key="slot.id">
          <button
            type="button"
            class="focus-ring flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-card transition-colors hover:border-primary"
            @click="choose({ groupId: slot.group.id, date: '' })"
          >
            <span class="inline-flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-soft text-xs font-semibold text-primary-soft-fg tabular-nums">
              <Clock class="size-4" aria-hidden="true" />{{ slot.startTime }}
            </span>
            <span class="min-w-0">
              <span class="block truncate font-medium text-fg">{{ slot.group.name }}</span>
              <span class="block truncate text-sm text-fg-muted">{{ slot.startTime }}–{{ slot.endTime }}<template v-if="slot.room"> · {{ slot.room.name }}</template></span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
      <div class="flex flex-col gap-1.5">
        <label for="attendance-group" class="text-xs font-medium text-fg-muted">{{ $t('enrollments.group') }}</label>
        <AppSelect
          id="attendance-group"
          :model-value="list.state.groupId"
          :options="groups.options.value"
          :placeholder="$t('attendance.chooseGroup')"
          @update:model-value="choose({ groupId: $event })"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="attendance-date" class="text-xs font-medium text-fg-muted">{{ $t('common.date') }}</label>
        <AppDatePicker
          id="attendance-date"
          :model-value="date"
          :max="can(P.ATTENDANCE_MARK_FUTURE) ? undefined : today"
          @update:model-value="choose({ date: $event === today ? '' : $event })"
        />
      </div>
    </div>

    <EmptyState v-if="!list.state.groupId" :icon="CheckCheck" :title="$t('attendance.startTitle')" :text="$t('attendance.startText')" />

    <QueryState v-else :loading="roster.isPending.value" :error="roster.error.value" loading-variant="list" @retry="roster.refetch()">
      <div v-if="roster.data.value" class="rounded-2xl border border-border bg-surface shadow-card">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div class="min-w-0">
            <p class="font-semibold text-fg">{{ roster.data.value.group.name }}</p>
            <p class="text-sm text-fg-muted">
              {{ format.weekday(date) }}, {{ format.day(date) }}
              <template v-if="roster.data.value.teacher"> · {{ fullName(roster.data.value.teacher) }}</template>
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span v-for="status in ATTENDANCE_STATUSES" :key="status" class="rounded-full bg-surface-muted px-2.5 py-1 text-fg-muted">
              {{ $t(`status.attendance.${status}`) }}: <strong class="text-fg tabular-nums">{{ counts[status] }}</strong>
            </span>
            <AppButton v-if="canMark && unmarked > 0" size="sm" variant="soft" :icon="CheckCheck" @click="markAll">{{ $t('attendance.allPresent') }}</AppButton>
          </div>
        </div>

        <EmptyState v-if="students.length === 0" compact :text="$t('attendance.noStudents')" />
        <ul v-else>
          <li v-for="entry in students" :key="entry.enrollment.id" class="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:px-5">
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <AppAvatar :name="fullName(entry.student)" size="sm" />
              <span class="truncate font-medium text-fg">{{ fullName(entry.student) }}</span>
              <span v-if="!marks[entry.enrollment.id]" class="text-xs text-fg-subtle">{{ $t('attendance.notMarked') }}</span>
            </div>
            <fieldset class="grid grid-cols-4 gap-1.5 sm:flex" :disabled="!canMark">
              <legend class="sr-only">{{ fullName(entry.student) }}</legend>
              <label
                v-for="status in ATTENDANCE_STATUSES"
                :key="status"
                class="flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-3 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:min-h-9"
                :class="marks[entry.enrollment.id] === status ? tones[status] : 'bg-surface-muted text-fg-muted hover:text-fg'"
              >
                <input v-model="marks[entry.enrollment.id]" type="radio" class="sr-only" :name="`att-${entry.enrollment.id}`" :value="status" />
                {{ $t(`status.attendance.${status}`) }}
              </label>
            </fieldset>
          </li>
        </ul>
        <div v-if="canMark && students.length" class="hidden items-center justify-end gap-3 border-t border-border px-5 py-3 md:flex">
          <FormError :message="error" class="mr-auto" />
          <span v-if="changed" class="text-sm text-fg-muted">{{ $t('attendance.changed', { count: changed }, changed) }}</span>
          <AppButton :icon="Save" :loading="save.isPending.value" :disabled="changed === 0" @click="submit">{{ $t('common.save') }}</AppButton>
        </div>
      </div>
    </QueryState>

    <!-- Phone: the save action stays under the thumb. -->
    <div
      v-if="canMark && changed > 0"
      class="glass-strong fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2 rounded-2xl p-3 md:hidden"
    >
      <FormError :message="error" />
      <AppButton block :icon="Save" :loading="save.isPending.value" @click="submit">
        {{ $t('attendance.saveCount', { count: changed }, changed) }}
      </AppButton>
    </div>
  </div>
</template>

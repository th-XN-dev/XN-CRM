<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePermission } from '@/composables/usePermission';
import { useRoomOptions } from '@/features/rooms/api';
import { WEEK_DAYS, type WeekDay } from '@/lib/dates';
import type { ScheduleResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { groupsApi } from '../api';

/**
 * A weekly lesson of a group. The server checks room, teacher and group
 * clashes; a clash is shown on the field it concerns ("Room is booked").
 */
const props = defineProps<{
  group: { id: string; branchId: string; roomId: string | null };
  schedule?: ScheduleResponseDto | null;
}>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const { can } = usePermission();
const rooms = useRoomOptions(() => open.value && can(P.ROOMS_READ), () => props.group.branchId);
const editing = computed(() => !!props.schedule);
const dayOptions = computed(() => WEEK_DAYS.map((day) => ({ value: day, label: t(`schedule.days.${day}`) })));

const time = () => z.string().refine((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v), () => ({ message: t('schedule.timeFormat') }));
const schema = z
  .object({ dayOfWeek: z.enum(WEEK_DAYS as unknown as [WeekDay, ...WeekDay[]]), startTime: time(), endTime: time(), roomId: z.string() })
  .superRefine((values, context) => {
    if (values.endTime <= values.startTime) {
      context.addIssue({ code: 'custom', path: ['endTime'], message: t('errors.INVALID_TIME_RANGE') });
    }
  });

const save = useApiMutation({
  fn: (values: z.output<typeof schema>) => {
    const body = { ...values, roomId: values.roomId || null };
    return props.schedule ? groupsApi.updateSchedule(props.schedule.id, body) : groupsApi.addSchedule(props.group.id, body);
  },
  invalidates: [['schedules'], ['attendance']],
  success: () => (editing.value ? t('schedule.slotSaved') : t('schedule.slotAdded')),
  onSuccess: () => {
    open.value = false;
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    dayOfWeek: (props.schedule?.dayOfWeek ?? 'MONDAY') as WeekDay,
    startTime: props.schedule?.startTime ?? '09:00',
    endTime: props.schedule?.endTime ?? '10:30',
    roomId: props.schedule ? (props.schedule.roomId ?? '') : (props.group.roomId ?? ''),
  }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: {
    ROOM_SCHEDULE_CONFLICT: 'roomId',
    ROOM_INACTIVE: 'roomId',
    TEACHER_SCHEDULE_CONFLICT: 'startTime',
    GROUP_SCHEDULE_CONFLICT: 'startTime',
    INVALID_TIME_RANGE: 'endTime',
  },
});
const [dayOfWeek] = defineField('dayOfWeek');
const [startTime] = defineField('startTime');
const [endTime] = defineField('endTime');
const [roomId] = defineField('roomId');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('schedule.editSlot') : $t('schedule.addSlot')" :loading="isSubmitting" :error="formError" size="sm" @submit="onSubmit">
    <FormField v-slot="field" :label="$t('schedule.day')" :error="errors.dayOfWeek">
      <AppSelect :id="field.id" :model-value="dayOfWeek" :options="dayOptions" :invalid="field.invalid" :described-by="field.describedBy" @update:model-value="dayOfWeek = $event as WeekDay" />
    </FormField>
    <div class="grid grid-cols-2 gap-4">
      <FormField v-slot="field" :label="$t('schedule.start')" :error="errors.startTime">
        <AppInput :id="field.id" v-model="startTime" type="time" step="300" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('schedule.end')" :error="errors.endTime">
        <AppInput :id="field.id" v-model="endTime" type="time" step="300" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-if="can(P.ROOMS_READ)" v-slot="field" :label="$t('groups.room')" optional :error="errors.roomId">
      <AppSelect :id="field.id" v-model="roomId" :options="[{ value: '', label: $t('groups.noRoom') }, ...rooms.options.value]" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

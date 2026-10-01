<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import MoneyInput from '@/components/forms/MoneyInput.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePermission } from '@/composables/usePermission';
import { useCourse, useCourseOptions } from '@/features/courses/queries';
import { useRoomOptions } from '@/features/rooms/api';
import { useTeacherOptions } from '@/features/teachers/queries';
import { orgDay } from '@/lib/dates';
import { zDate, zId, zInt, zOptionalDate, zOptionalMoney, zText } from '@/lib/validation';
import type { GroupResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { groupsApi } from '../api';

/**
 * A group = course (+ level) in a branch, with a teacher, a room and seats.
 * The price defaults to the course's monthly price. Branch and course are
 * fixed once created.
 */
const props = defineProps<{ group?: GroupResponseDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [group: GroupResponseDto] }>();
const { t } = useI18n();
const { can } = usePermission();
const session = useSessionStore();
const branches = useBranchOptions();
const editing = computed(() => !!props.group);
const courses = useCourseOptions(() => open.value);

const schema = z
  .object({
    name: zText(120, 2),
    branchId: z.string().default(''),
    courseId: zId(),
    levelId: z.string().default(''),
    teacherId: z.string().default(''),
    roomId: z.string().default(''),
    capacity: zInt(1, 500),
    monthlyPrice: zOptionalMoney(),
    startDate: zDate(),
    endDate: zOptionalDate(),
  })
  .superRefine((values, context) => {
    if (values.endDate && values.endDate < values.startDate) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: t('errors.INVALID_DATE_RANGE') });
    }
  });

const save = useApiMutation({
  fn: (values: z.output<typeof schema>) => {
    const common = {
      name: values.name,
      levelId: values.levelId || undefined,
      teacherId: values.teacherId || null,
      roomId: values.roomId || null,
      capacity: values.capacity,
      monthlyPrice: values.monthlyPrice,
      startDate: values.startDate,
      endDate: values.endDate,
    };
    return props.group
      ? groupsApi.update(props.group.id, common)
      : groupsApi.create({ ...common, courseId: values.courseId, branchId: values.branchId || undefined });
  },
  invalidates: [['groups'], ['schedules'], ['teachers'], ['courses'], ['dashboard']],
  success: () => (editing.value ? t('groups.saved') : t('groups.created')),
  onSuccess: (group) => {
    open.value = false;
    emit('saved', group);
  },
});

const { defineField, errors, onSubmit, formError, reset, isSubmitting, values, setFieldValue } = useEntityForm({
  schema,
  initialValues: () => ({
    name: props.group?.name ?? '',
    branchId: props.group?.branchId ?? branches.defaultId.value,
    courseId: props.group?.courseId ?? '',
    levelId: props.group?.levelId ?? '',
    teacherId: props.group?.teacherId ?? '',
    roomId: props.group?.roomId ?? '',
    capacity: props.group ? String(props.group.capacity) : '12',
    monthlyPrice: props.group ? String(Math.round(Number(props.group.monthlyPrice))) : '',
    startDate: props.group?.startDate.slice(0, 10) ?? orgDay(session.organization?.timezone),
    endDate: props.group?.endDate?.slice(0, 10) ?? '',
  }),
  submit: (formValues) => save.mutateAsync(formValues),
  fieldCodes: {
    GROUP_CAPACITY_BELOW_ENROLLED: 'capacity',
    LEVEL_COURSE_MISMATCH: 'levelId',
    LEVEL_INACTIVE: 'levelId',
    COURSE_INACTIVE: 'courseId',
    TEACHER_INACTIVE: 'teacherId',
    TEACHER_SCHEDULE_CONFLICT: 'teacherId',
    ROOM_INACTIVE: 'roomId',
    ROOM_BRANCH_MISMATCH: 'roomId',
    ROOM_SCHEDULE_CONFLICT: 'roomId',
  },
});
const [name] = defineField('name');
const [branchId] = defineField('branchId');
const [courseId] = defineField('courseId');
const [levelId] = defineField('levelId');
const [teacherId] = defineField('teacherId');
const [roomId] = defineField('roomId');
const [capacity] = defineField('capacity');
const [monthlyPrice] = defineField('monthlyPrice');
const [startDate] = defineField('startDate');
const [endDate] = defineField('endDate');

const course = useCourse(() => values.courseId ?? '');
const levelOptions = computed(() =>
  (course.data.value?.levels ?? [])
    .filter((level) => level.isActive || level.id === props.group?.levelId)
    .sort((a, b) => a.order - b.order)
    .map((level) => ({ value: level.id, label: level.name })),
);
const teachers = useTeacherOptions(() => open.value && can(P.TEACHERS_READ), () => values.branchId);
const rooms = useRoomOptions(() => open.value && can(P.ROOMS_READ), () => values.branchId);

/** A new course brings its price and clears a level of another course. */
watch(
  () => course.data.value,
  (loaded) => {
    if (!loaded || editing.value) return;
    if (!values.monthlyPrice) setFieldValue('monthlyPrice', String(Math.round(Number(loaded.monthlyPrice))));
    if (values.levelId && !loaded.levels.some((level) => level.id === values.levelId)) setFieldValue('levelId', '');
  },
);

watch(open, (value) => value && reset());
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="editing ? $t('groups.edit') : $t('groups.new')"
    :loading="isSubmitting"
    :error="formError"
    size="lg"
    @submit="onSubmit"
  >
    <FormField v-slot="field" :label="$t('groups.name')" :error="errors.name">
      <AppInput :id="field.id" v-model="name" :placeholder="$t('groups.namePlaceholder')" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-if="!editing && branches.options.value.length > 1" v-slot="field" :label="$t('common.branch')" :error="errors.branchId">
        <AppSelect :id="field.id" v-model="branchId" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('groups.course')" :error="errors.courseId">
        <AppSelect
          :id="field.id"
          v-model="courseId"
          :options="editing && group ? [{ value: group.courseId, label: group.course.name }] : courses.options.value"
          :placeholder="$t('groups.chooseCourse')"
          :disabled="editing"
          :invalid="field.invalid"
          :described-by="field.describedBy"
        />
      </FormField>
      <FormField v-slot="field" :label="$t('groups.level')" optional :error="errors.levelId">
        <AppSelect
          :id="field.id"
          v-model="levelId"
          :options="[{ value: '', label: $t('groups.noLevel') }, ...levelOptions]"
          :disabled="!values.courseId"
          :invalid="field.invalid"
          :described-by="field.describedBy"
        />
      </FormField>
      <FormField v-if="can(P.TEACHERS_READ)" v-slot="field" :label="$t('groups.teacher')" optional :error="errors.teacherId">
        <AppSelect :id="field.id" v-model="teacherId" :options="[{ value: '', label: $t('groups.noTeacher') }, ...teachers.options.value]" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-if="can(P.ROOMS_READ)" v-slot="field" :label="$t('groups.room')" optional :error="errors.roomId">
        <AppSelect :id="field.id" v-model="roomId" :options="[{ value: '', label: $t('groups.noRoom') }, ...rooms.options.value]" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('groups.capacity')" :error="errors.capacity">
        <AppInput :id="field.id" v-model="capacity" type="number" inputmode="numeric" min="1" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('groups.monthlyPrice')" :hint="$t('groups.priceHint')" :error="errors.monthlyPrice">
        <MoneyInput :id="field.id" v-model="monthlyPrice" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('groups.startDate')" :error="errors.startDate">
        <AppDatePicker :id="field.id" v-model="startDate" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('groups.endDate')" optional :error="errors.endDate">
        <AppDatePicker :id="field.id" v-model="endDate" :min="values.startDate" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
  </FormModal>
</template>

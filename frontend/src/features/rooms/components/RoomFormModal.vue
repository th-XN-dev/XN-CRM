<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useEntityForm } from '@/composables/useEntityForm';
import { zInt, zOptionalId, zText } from '@/lib/validation';
import type { RoomResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { roomsApi } from '../api';

const props = defineProps<{ room?: RoomResponseDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const branches = useBranchOptions();
const editing = computed(() => !!props.room);

const schema = z.object({
  name: zText(80),
  code: z.string().trim().toUpperCase().refine((v) => /^[A-Z0-9_-]{1,20}$/.test(v), () => ({ message: t('validation.code') })),
  capacity: zInt(1, 500),
  branchId: zOptionalId(),
});
const save = useApiMutation({
  fn: ({ branchId, ...values }: z.output<typeof schema>) =>
    props.room ? roomsApi.update(props.room.id, values) : roomsApi.create({ ...values, branchId }),
  invalidates: [['rooms'], ['schedules']],
  success: () => (editing.value ? t('rooms.saved') : t('rooms.created')),
  onSuccess: () => {
    open.value = false;
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    name: props.room?.name ?? '',
    code: props.room?.code ?? '',
    capacity: props.room ? String(props.room.capacity) : '',
    branchId: props.room?.branchId ?? branches.defaultId.value,
  }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: { ROOM_CODE_TAKEN: 'code' },
});
const [name] = defineField('name');
const [code] = defineField('code');
const [capacity] = defineField('capacity');
const [branchId] = defineField('branchId');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('rooms.edit') : $t('rooms.new')" :loading="isSubmitting" :error="formError" size="sm" @submit="onSubmit">
    <FormField v-slot="field" :label="$t('rooms.name')" :error="errors.name">
      <AppInput :id="field.id" v-model="name" :placeholder="$t('rooms.namePlaceholder')" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <div class="grid grid-cols-2 gap-4">
      <FormField v-slot="field" :label="$t('common.code')" :error="errors.code">
        <AppInput :id="field.id" v-model="code" placeholder="101" autocapitalize="characters" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('rooms.capacity')" :error="errors.capacity">
        <AppInput :id="field.id" v-model="capacity" type="number" inputmode="numeric" min="1" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-if="!editing && branches.options.value.length > 1" v-slot="field" :label="$t('common.branch')" :error="errors.branchId">
      <AppSelect :id="field.id" v-model="branchId" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

<script setup lang="ts">
import { ArrowDown } from 'lucide-vue-next';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import EntityPicker, { type PickerOption } from '@/components/forms/EntityPicker.vue';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePickers } from '@/composables/usePickers';
import { orgDay } from '@/lib/dates';
import { zDate, zId, zOptionalText } from '@/lib/validation';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { ENROLLMENT_KEYS, enrollmentsApi } from '../api';

/**
 * Move a student to another group in one step: the current enrollment becomes
 * TRANSFERRED and a new ACTIVE one starts (the server does both atomically).
 */
const props = defineProps<{
  enrollment: { id: string; studentName: string; groupId: string; groupName: string } | null;
}>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const session = useSessionStore();
const pickers = usePickers();
const target = ref<PickerOption | null>(null);

const schema = z.object({ targetGroupId: zId(), transferDate: zDate(), notes: zOptionalText(1000) });

const transfer = useApiMutation({
  fn: (values: z.output<typeof schema>) => enrollmentsApi.transfer(props.enrollment?.id ?? '', values),
  invalidates: ENROLLMENT_KEYS,
  success: (result) => t('enrollments.transferred', { group: result.current.group.name }),
  onSuccess: () => {
    open.value = false;
  },
});

const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({ targetGroupId: '', transferDate: orgDay(session.organization?.timezone), notes: '' }),
  submit: (values) => transfer.mutateAsync(values),
  fieldCodes: { GROUP_CAPACITY_FULL: 'targetGroupId', TRANSFER_SAME_GROUP: 'targetGroupId', GROUP_NOT_ACTIVE: 'targetGroupId' },
});
const [targetGroupId] = defineField('targetGroupId');
const [transferDate] = defineField('transferDate');
const [notes] = defineField('notes');

watch(open, (value) => {
  if (!value) return;
  target.value = null;
  reset();
});
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="$t('enrollments.transferTitle')"
    :description="enrollment?.studentName"
    :submit-label="$t('enrollments.transfer')"
    :loading="isSubmitting"
    :error="formError"
    @submit="onSubmit"
  >
    <div class="rounded-2xl bg-surface-muted/60 p-4 text-sm">
      <p class="text-fg-muted">{{ $t('enrollments.currentGroup') }}</p>
      <p class="font-medium text-fg">{{ enrollment?.groupName }}</p>
    </div>
    <ArrowDown class="mx-auto -my-2 size-5 text-fg-subtle" aria-hidden="true" />
    <FormField v-slot="field" :label="$t('enrollments.newGroup')" :error="errors.targetGroupId">
      <EntityPicker
        :id="field.id"
        v-model="targetGroupId"
        :search="pickers.groups({ excludeId: enrollment?.groupId })"
        :placeholder="$t('enrollments.groupSearch')"
        :invalid="field.invalid"
        :described-by="field.describedBy"
        @select="target = $event"
      />
    </FormField>
    <p v-if="target" class="-mt-2 text-sm text-fg-muted">{{ target.description }}</p>
    <FormField v-slot="field" :label="$t('enrollments.transferDate')" :hint="$t('enrollments.transferHint')" :error="errors.transferDate">
      <AppDatePicker :id="field.id" v-model="transferDate" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('common.note')" optional :error="errors.notes">
      <AppTextarea :id="field.id" v-model="notes" :rows="2" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

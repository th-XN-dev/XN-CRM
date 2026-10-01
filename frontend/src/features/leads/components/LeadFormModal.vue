<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { P } from '@/app/config/permissions';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useEntityForm } from '@/composables/useEntityForm';
import { usePermission } from '@/composables/usePermission';
import { useMembers } from '@/features/organizations/queries';
import { fromLocalInput, toLocalInput } from '@/lib/dates';
import { zOptionalId, zOptionalPhone, zOptionalText, zPhone, zText } from '@/lib/validation';
import type { LeadDetailDto, LeadResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { LEAD_KEYS, LEAD_PRIORITIES, type LeadPriority, leadsApi } from '../api';
import { useLeadSources } from '../queries';

/** A potential student: who, how to reach them, where they came from, who follows up. */
const props = defineProps<{ lead?: LeadDetailDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [lead: LeadResponseDto] }>();
const { t } = useI18n();
const { can } = usePermission();
const branches = useBranchOptions();
const sources = useLeadSources();
const editing = computed(() => !!props.lead);
const members = useMembers(() => branches.defaultId.value);
const priorityOptions = computed(() => LEAD_PRIORITIES.map((value) => ({ value, label: t(`status.leadPriority.${value}`) })));

const schema = z.object({
  name: zText(120, 2),
  phone: zPhone(),
  secondaryPhone: zOptionalPhone(),
  sourceId: zOptionalId(),
  priority: z.enum(LEAD_PRIORITIES as [LeadPriority, ...LeadPriority[]]),
  assignedToId: zOptionalId(),
  branchId: zOptionalId(),
  nextFollowUpAt: z.string().default(''),
  notes: zOptionalText(2000),
});
const save = useApiMutation({
  fn: ({ assignedToId, branchId, nextFollowUpAt, ...values }: z.output<typeof schema>) =>
    props.lead
      ? leadsApi.update(props.lead.id, { ...values, nextFollowUpAt: fromLocalInput(nextFollowUpAt) })
      : leadsApi.create({ ...values, assignedToId, branchId, nextFollowUpAt: fromLocalInput(nextFollowUpAt) }),
  invalidates: LEAD_KEYS,
  success: () => (editing.value ? t('leads.saved') : t('leads.created')),
  onSuccess: (lead) => {
    open.value = false;
    emit('saved', lead);
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    name: props.lead?.name ?? '',
    phone: props.lead?.phone ?? '',
    secondaryPhone: props.lead?.secondaryPhone ?? '',
    sourceId: props.lead?.sourceId ?? '',
    priority: (props.lead?.priority ?? 'MEDIUM') as LeadPriority,
    assignedToId: '',
    branchId: branches.defaultId.value,
    nextFollowUpAt: toLocalInput(props.lead?.nextFollowUpAt),
    notes: props.lead?.notes ?? '',
  }),
  submit: (values) => save.mutateAsync(values),
  fieldCodes: { DUPLICATE_LEAD: 'phone', LEAD_SOURCE_INACTIVE: 'sourceId', LEAD_ASSIGNEE_NO_BRANCH_ACCESS: 'assignedToId', LEAD_ASSIGNEE_NOT_MEMBER: 'assignedToId' },
});
const [name] = defineField('name');
const [phone] = defineField('phone');
const [secondaryPhone] = defineField('secondaryPhone');
const [sourceId] = defineField('sourceId');
const [priority] = defineField('priority');
const [assignedToId] = defineField('assignedToId');
const [branchId] = defineField('branchId');
const [nextFollowUpAt] = defineField('nextFollowUpAt');
const [notes] = defineField('notes');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('leads.edit') : $t('leads.new')" :loading="isSubmitting" :error="formError" @submit="onSubmit">
    <FormField v-slot="field" :label="$t('leads.name')" :error="errors.name">
      <AppInput :id="field.id" v-model="name" :placeholder="$t('leads.namePlaceholder')" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('common.phone')" :error="errors.phone">
        <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" placeholder="+998 90 123 45 67" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('families.secondaryPhone')" optional :error="errors.secondaryPhone">
        <AppInput :id="field.id" v-model="secondaryPhone" type="tel" inputmode="tel" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-if="sources.options.value.length" v-slot="field" :label="$t('leads.source')" optional :error="errors.sourceId">
        <AppSelect :id="field.id" v-model="sourceId" :options="[{ value: '', label: $t('leads.noSource') }, ...sources.options.value]" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('leads.priority')" :error="errors.priority">
        <AppSelect :id="field.id" :model-value="priority" :options="priorityOptions" :invalid="field.invalid" :described-by="field.describedBy" @update:model-value="priority = $event as LeadPriority" />
      </FormField>
      <template v-if="!editing">
        <FormField v-if="can(P.LEADS_ASSIGN) && members.options.value.length" v-slot="field" :label="$t('leads.assignee')" optional :error="errors.assignedToId">
          <AppSelect :id="field.id" v-model="assignedToId" :options="[{ value: '', label: $t('common.unassigned') }, ...members.options.value]" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-if="branches.options.value.length > 1" v-slot="field" :label="$t('common.branch')" :error="errors.branchId">
          <AppSelect :id="field.id" v-model="branchId" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
      </template>
      <FormField v-slot="field" :label="$t('leads.followUp')" optional :error="errors.nextFollowUpAt">
        <AppInput :id="field.id" v-model="nextFollowUpAt" type="datetime-local" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-slot="field" :label="$t('common.notes')" optional :error="errors.notes">
      <AppTextarea :id="field.id" v-model="notes" :rows="3" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

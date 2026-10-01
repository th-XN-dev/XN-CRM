<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import EntityPicker from '@/components/forms/EntityPicker.vue';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import MoneyInput from '@/components/forms/MoneyInput.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect, { type SelectOption } from '@/components/ui/AppSelect.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useEntityForm } from '@/composables/useEntityForm';
import { useFormatters } from '@/composables/useFormatters';
import { usePickers } from '@/composables/usePickers';
import { studentsApi } from '@/features/students/api';
import { addDays, orgDay } from '@/lib/dates';
import { fullName } from '@/lib/people';
import { zDate, zId, zMoney, zOptionalId, zOptionalMoney, zOptionalText } from '@/lib/validation';
import type { InvoiceListItemDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { financeApi, MONEY_KEYS } from '../api';

/**
 * Bill a family (optionally for one of its students). Amount − discount = to
 * pay; the total is shown live so nobody does the maths on paper.
 */
const props = defineProps<{
  family?: { id: string; name: string } | null;
  student?: { id: string; name: string } | null;
  /** Edit: only amount, discount, due date and description can change. */
  invoice?: InvoiceListItemDto | null;
}>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [invoice: InvoiceListItemDto] }>();
const { t } = useI18n();
const session = useSessionStore();
const branches = useBranchOptions();
const pickers = usePickers();
const format = useFormatters();
const editing = computed(() => !!props.invoice);
const studentOptions = ref<SelectOption[]>([]);
const today = computed(() => orgDay(session.organization?.timezone));

const schema = z
  .object({
    familyId: zId(),
    studentId: zOptionalId(),
    amount: zMoney(),
    discount: zOptionalMoney(),
    issueDate: zDate(),
    dueDate: zDate(),
    description: zOptionalText(1000),
    branchId: zOptionalId(),
  })
  .superRefine((values, context) => {
    if ((values.discount ?? 0) > values.amount) {
      context.addIssue({ code: 'custom', path: ['discount'], message: t('errors.INVALID_DISCOUNT') });
    }
    if (values.dueDate < values.issueDate) {
      context.addIssue({ code: 'custom', path: ['dueDate'], message: t('finance.dueBeforeIssue') });
    }
  });

const save = useApiMutation({
  fn: (values: z.output<typeof schema>) =>
    props.invoice
      ? financeApi.updateInvoice(props.invoice.id, {
          amount: values.amount,
          discount: values.discount ?? 0,
          dueDate: values.dueDate,
          description: values.description,
        })
      : financeApi.createInvoice({ ...values, discount: values.discount ?? 0 }),
  invalidates: MONEY_KEYS,
  success: (invoice) => (editing.value ? t('finance.invoiceSaved') : t('finance.invoiceCreated', { number: invoice.invoiceNumber })),
  onSuccess: (invoice) => {
    open.value = false;
    emit('saved', invoice);
  },
});

const { defineField, errors, onSubmit, formError, reset, isSubmitting, values } = useEntityForm({
  schema,
  initialValues: () => ({
    familyId: props.invoice?.familyId ?? props.family?.id ?? '',
    studentId: props.invoice?.studentId ?? props.student?.id ?? '',
    amount: props.invoice ? String(Math.round(Number(props.invoice.amount))) : '',
    discount: props.invoice && Number(props.invoice.discount) > 0 ? String(Math.round(Number(props.invoice.discount))) : '',
    issueDate: props.invoice?.issueDate.slice(0, 10) ?? today.value,
    dueDate: props.invoice?.dueDate.slice(0, 10) ?? addDays(today.value, 7),
    description: props.invoice?.description ?? '',
    branchId: props.invoice?.branchId ?? branches.defaultId.value,
  }),
  submit: (formValues) => save.mutateAsync(formValues),
  fieldCodes: {
    INVALID_DISCOUNT: 'discount',
    STUDENT_NOT_IN_FAMILY: 'studentId',
    INVOICE_AMOUNT_BELOW_PAID: 'amount',
    FAMILY_INACTIVE: 'familyId',
  },
});
const [familyId] = defineField('familyId');
const [studentId] = defineField('studentId');
const [amount] = defineField('amount');
const [discount] = defineField('discount');
const [issueDate] = defineField('issueDate');
const [dueDate] = defineField('dueDate');
const [description] = defineField('description');
const [branchId] = defineField('branchId');

const toPay = computed(() => Math.max(Number(values.amount || 0) - Number(values.discount || 0), 0));

/** The family's students, to optionally tie the charge to one of them. */
watch(
  () => [open.value, values.familyId] as const,
  async ([isOpen, id]) => {
    studentOptions.value = [];
    if (!isOpen || !id || editing.value) return;
    const page = await studentsApi.list({ familyId: id, limit: 50, sortBy: 'firstName', sortOrder: 'asc' });
    studentOptions.value = page.items.map((student) => ({ value: student.id, label: fullName(student) }));
  },
);

watch(open, (value) => value && reset());
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="editing ? $t('finance.editInvoice') : $t('finance.newInvoice')"
    :description="editing ? invoice?.invoiceNumber : undefined"
    :submit-label="editing ? $t('common.save') : $t('finance.createInvoice')"
    :loading="isSubmitting"
    :error="formError"
    @submit="onSubmit"
  >
    <template v-if="!editing">
      <FormField v-if="!family" v-slot="field" :label="$t('finance.family')" :error="errors.familyId">
        <EntityPicker :id="field.id" v-model="familyId" :search="pickers.families" :placeholder="$t('students.familySearch')" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <p v-else class="text-sm"><span class="text-fg-muted">{{ $t('finance.family') }}:</span> <strong class="text-fg">{{ family.name }}</strong></p>
      <FormField v-if="!student && studentOptions.length" v-slot="field" :label="$t('finance.forStudent')" optional :error="errors.studentId">
        <AppSelect :id="field.id" v-model="studentId" :options="[{ value: '', label: $t('finance.wholeFamily') }, ...studentOptions]" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <p v-else-if="student" class="-mt-2 text-sm"><span class="text-fg-muted">{{ $t('finance.forStudent') }}:</span> <strong class="text-fg">{{ student.name }}</strong></p>
    </template>

    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('common.amount')" :error="errors.amount">
        <MoneyInput :id="field.id" v-model="amount" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('finance.discount')" optional :error="errors.discount">
        <MoneyInput :id="field.id" v-model="discount" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <p class="-mt-1 rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm text-fg" aria-live="polite">
      {{ $t('finance.toPay') }}: <strong class="tabular-nums">{{ format.money(toPay) }}</strong>
    </p>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-if="!editing" v-slot="field" :label="$t('finance.issueDate')" :error="errors.issueDate">
        <AppDatePicker :id="field.id" v-model="issueDate" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('finance.dueDate')" :error="errors.dueDate">
        <AppDatePicker :id="field.id" v-model="dueDate" :min="values.issueDate" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-if="!editing && branches.options.value.length > 1" v-slot="field" :label="$t('common.branch')" :error="errors.branchId">
      <AppSelect :id="field.id" v-model="branchId" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <FormField v-slot="field" :label="$t('common.description')" :hint="$t('finance.descriptionHint')" optional :error="errors.description">
      <AppInput :id="field.id" v-model="description" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import MoneyInput from '@/components/forms/MoneyInput.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { useBranchOptions } from '@/composables/useBranchOptions';
import { useEntityForm } from '@/composables/useEntityForm';
import { orgDay } from '@/lib/dates';
import { zDate, zMoney, zOptionalId, zOptionalText } from '@/lib/validation';
import type { ExpenseResponseDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, type ExpenseCategory, type ExpenseMethod, financeApi, MONEY_KEYS } from '../api';

/** Money going out. Cash expenses come out of the open cash desk (the server links them). */
const props = defineProps<{ expense?: ExpenseResponseDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const session = useSessionStore();
const branches = useBranchOptions();
const editing = computed(() => !!props.expense);
const categoryOptions = computed(() => EXPENSE_CATEGORIES.map((value) => ({ value, label: t(`finance.categories.${value}`) })));
const methodOptions = computed(() => EXPENSE_METHODS.map((value) => ({ value, label: t(`finance.methods.${value}`) })));

const schema = z.object({
  category: z.enum(EXPENSE_CATEGORIES as [ExpenseCategory, ...ExpenseCategory[]]),
  amount: zMoney(),
  paymentMethod: z.enum(EXPENSE_METHODS as [ExpenseMethod, ...ExpenseMethod[]]),
  expenseDate: zDate(),
  description: zOptionalText(1000),
  branchId: zOptionalId(),
});
const save = useApiMutation({
  fn: ({ paymentMethod, branchId, ...values }: z.output<typeof schema>) =>
    props.expense ? financeApi.updateExpense(props.expense.id, values) : financeApi.createExpense({ ...values, paymentMethod, branchId }),
  invalidates: MONEY_KEYS,
  success: () => (editing.value ? t('finance.expenseSaved') : t('finance.expenseCreated')),
  onSuccess: () => {
    open.value = false;
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({
    category: (props.expense?.category ?? 'OTHER') as ExpenseCategory,
    amount: props.expense ? String(Math.round(Number(props.expense.amount))) : '',
    paymentMethod: (props.expense?.paymentMethod ?? 'CASH') as ExpenseMethod,
    expenseDate: props.expense?.expenseDate.slice(0, 10) ?? orgDay(session.organization?.timezone),
    description: props.expense?.description ?? '',
    branchId: props.expense?.branchId ?? branches.defaultId.value,
  }),
  submit: (values) => save.mutateAsync(values),
});
const [category] = defineField('category');
const [amount] = defineField('amount');
const [paymentMethod] = defineField('paymentMethod');
const [expenseDate] = defineField('expenseDate');
const [description] = defineField('description');
const [branchId] = defineField('branchId');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal v-model:open="open" :title="editing ? $t('finance.editExpense') : $t('finance.newExpense')" :loading="isSubmitting" :error="formError" @submit="onSubmit">
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" :label="$t('finance.category')" :error="errors.category">
        <AppSelect :id="field.id" :model-value="category" :options="categoryOptions" :invalid="field.invalid" :described-by="field.describedBy" @update:model-value="category = $event as ExpenseCategory" />
      </FormField>
      <FormField v-slot="field" :label="$t('common.amount')" :error="errors.amount">
        <MoneyInput :id="field.id" v-model="amount" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-slot="field" :label="$t('finance.method')" :hint="editing ? $t('finance.methodFixed') : undefined" :error="errors.paymentMethod">
        <AppSelect :id="field.id" :model-value="paymentMethod" :options="methodOptions" :disabled="editing" :invalid="field.invalid" :described-by="field.describedBy" @update:model-value="paymentMethod = $event as ExpenseMethod" />
      </FormField>
      <FormField v-slot="field" :label="$t('common.date')" :error="errors.expenseDate">
        <AppDatePicker :id="field.id" v-model="expenseDate" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <FormField v-if="!editing && branches.options.value.length > 1" v-slot="field" :label="$t('common.branch')" :error="errors.branchId">
        <AppSelect :id="field.id" v-model="branchId" :options="branches.options.value" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
    </div>
    <FormField v-slot="field" :label="$t('common.description')" optional :error="errors.description">
      <AppInput :id="field.id" v-model="description" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

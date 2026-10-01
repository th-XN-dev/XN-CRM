<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { zOptionalText } from '@/lib/validation';
import { useApiMutation } from '@/services/query/useApiQuery';
import { financeApi, MONEY_KEYS } from '../api';

/** Cancel a charge made by mistake. Paid invoices must be refunded first (the server says so). */
const props = defineProps<{ invoice: { id: string; invoiceNumber: string } | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const schema = z.object({ reason: zOptionalText(500) });
const cancel = useApiMutation({
  fn: (values: z.output<typeof schema>) => financeApi.cancelInvoice(props.invoice?.id ?? '', values),
  invalidates: MONEY_KEYS,
  success: t('finance.invoiceCancelled'),
  onSuccess: () => {
    open.value = false;
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({ reason: '' }),
  submit: (values) => cancel.mutateAsync(values),
});
const [reason] = defineField('reason');
watch(open, (value) => value && reset());
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="$t('finance.cancelInvoiceTitle', { number: invoice?.invoiceNumber ?? '' })"
    :description="$t('finance.cancelInvoiceText')"
    :submit-label="$t('finance.cancelInvoice')"
    :loading="isSubmitting"
    :error="formError"
    danger
    size="sm"
    @submit="onSubmit"
  >
    <FormField v-slot="field" :label="$t('finance.reason')" optional :error="errors.reason">
      <AppTextarea :id="field.id" v-model="reason" :rows="2" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

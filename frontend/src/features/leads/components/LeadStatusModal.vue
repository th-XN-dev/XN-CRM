<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { useApiMutation } from '@/services/query/useApiQuery';
import { LEAD_KEYS, leadsApi, OPEN_STATUSES, type LeadStatus } from '../api';

/** Move a lead along the funnel, or mark it lost (with the reason — it is final). */
const props = defineProps<{ lead: { id: string; name: string; status: LeadStatus } | null; target?: LeadStatus | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const status = ref<LeadStatus>('CONTACTED');
const reason = ref('');
const error = ref<string | null>(null);
const options = computed(() =>
  [...OPEN_STATUSES, 'LOST' as const].filter((s) => s !== props.lead?.status).map((value) => ({ value, label: t(`status.lead.${value}`) })),
);
const change = useApiMutation({
  fn: () => leadsApi.changeStatus(props.lead?.id ?? '', status.value, reason.value.trim() || undefined),
  invalidates: LEAD_KEYS,
  success: () => t('leads.statusChanged', { status: t(`status.lead.${status.value}`) }),
  onSuccess: () => {
    open.value = false;
  },
});
async function submit(): Promise<void> {
  error.value = null;
  if (status.value === 'LOST' && !reason.value.trim()) {
    error.value = t('leads.lostReasonRequired');
    return;
  }
  try {
    await change.mutateAsync();
  } catch (failure) {
    error.value = apiErrorMessage(failure);
  }
}
watch(open, (value) => {
  if (!value) return;
  status.value = props.target ?? (options.value[0]?.value as LeadStatus) ?? 'CONTACTED';
  reason.value = '';
  error.value = null;
});
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="$t('leads.changeStatus')"
    :description="lead?.name"
    :submit-label="status === 'LOST' ? $t('leads.markLost') : $t('leads.move')"
    :loading="change.isPending.value"
    :error="error"
    :danger="status === 'LOST'"
    size="sm"
    @submit="submit"
  >
    <FormField v-slot="field" :label="$t('common.status')">
      <AppSelect :id="field.id" :model-value="status" :options="options" @update:model-value="status = $event as LeadStatus" />
    </FormField>
    <FormField v-if="status === 'LOST'" v-slot="field" :label="$t('leads.lostReason')" :hint="$t('leads.lostHint')">
      <AppTextarea :id="field.id" v-model="reason" :rows="2" :described-by="field.describedBy" />
    </FormField>
  </FormModal>
</template>

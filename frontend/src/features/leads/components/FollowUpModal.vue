<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { fromLocalInput, toLocalInput } from '@/lib/dates';
import { useApiMutation } from '@/services/query/useApiQuery';
import { LEAD_KEYS, leadsApi } from '../api';

/** When to contact the lead next — quick picks for the usual answers. */
const props = defineProps<{ lead: { id: string; name: string; nextFollowUpAt: string | null } | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const value = ref('');
const error = ref<string | null>(null);
const save = useApiMutation({
  fn: (at: string | null) => leadsApi.followUp(props.lead?.id ?? '', at),
  invalidates: LEAD_KEYS,
  success: (lead) => (lead.nextFollowUpAt ? t('leads.followUpSet') : t('leads.followUpCleared')),
  onSuccess: () => {
    open.value = false;
  },
});
function quick(days: number, hour = 10): void {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  value.value = toLocalInput(date.toISOString());
}
async function submit(clear = false): Promise<void> {
  error.value = null;
  try {
    await save.mutateAsync(clear ? null : (fromLocalInput(value.value) ?? null));
  } catch (failure) {
    error.value = apiErrorMessage(failure);
  }
}
watch(open, (isOpen) => {
  if (!isOpen) return;
  value.value = toLocalInput(props.lead?.nextFollowUpAt);
  error.value = null;
});
</script>

<template>
  <FormModal v-model:open="open" :title="$t('leads.followUp')" :description="lead?.name" :loading="save.isPending.value" :error="error" size="sm" @submit="submit()">
    <div class="flex flex-wrap gap-2">
      <AppButton size="sm" variant="secondary" @click="quick(0, 17)">{{ $t('leads.quick.today') }}</AppButton>
      <AppButton size="sm" variant="secondary" @click="quick(1)">{{ $t('leads.quick.tomorrow') }}</AppButton>
      <AppButton size="sm" variant="secondary" @click="quick(3)">{{ $t('leads.quick.in3days') }}</AppButton>
      <AppButton size="sm" variant="secondary" @click="quick(7)">{{ $t('leads.quick.nextWeek') }}</AppButton>
    </div>
    <FormField v-slot="field" :label="$t('leads.followUpAt')">
      <AppInput :id="field.id" v-model="value" type="datetime-local" :described-by="field.describedBy" />
    </FormField>
    <AppButton v-if="lead?.nextFollowUpAt" variant="ghost" size="sm" class="self-start" @click="submit(true)">{{ $t('leads.clearFollowUp') }}</AppButton>
  </FormModal>
</template>

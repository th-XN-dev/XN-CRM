<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppAlert from '@/components/ui/AppAlert.vue';
import AppDatePicker from '@/components/ui/AppDatePicker.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { orgDay } from '@/lib/dates';
import { isApiError } from '@/services/api/api-error';
import type { CenterDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { centersApi } from '../api';

/**
 * Freeze (with a reason for the history) or activate a center. Activating a
 * center whose period has ended asks for a new end date in the same step.
 */
const props = defineProps<{ center: CenterDto; action: 'freeze' | 'activate' }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const reason = ref('');
const until = ref('');
const error = ref<string | null>(null);
const today = computed(() => orgDay(props.center.timezone));
/** The period is over (or will be over before anyone can use it): a new end date is required. */
const needsNewUntil = ref(false);
watch(
  open,
  (value) => {
    if (!value) return;
    reason.value = '';
    error.value = null;
    until.value = '';
    needsNewUntil.value = !!props.center.activeUntil && props.center.activeUntil.slice(0, 10) < today.value;
  },
  { immediate: true },
);

const run = useApiMutation({
  fn: () =>
    props.action === 'freeze'
      ? centersApi.freeze(props.center.id, reason.value.trim() || undefined)
      : centersApi.activate(props.center.id, until.value ? { activeUntil: until.value } : {}),
  invalidates: [['owner']],
  success: () => (props.action === 'freeze' ? t('owner.centers.frozen') : t('owner.centers.activated')),
  onSuccess: () => {
    open.value = false;
  },
});

async function submit(): Promise<void> {
  error.value = null;
  if (props.action === 'activate' && needsNewUntil.value && !until.value) {
    error.value = t('owner.centers.activateEnded');
    return;
  }
  try {
    await run.mutateAsync();
  } catch (e) {
    if (isApiError(e) && e.code === 'CENTER_PERIOD_ENDED') needsNewUntil.value = true;
    error.value = apiErrorMessage(e);
  }
}
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="action === 'freeze' ? $t('owner.centers.freezeTitle', { name: center.name }) : $t('owner.centers.activateTitle', { name: center.name })"
    :description="action === 'freeze' ? $t('owner.centers.freezeText') : $t('owner.centers.activateText')"
    :submit-label="action === 'freeze' ? $t('owner.centers.actions.freeze') : $t('owner.centers.actions.activate')"
    :danger="action === 'freeze'"
    size="sm"
    :loading="run.isPending.value"
    :error="error"
    @submit="submit"
  >
    <FormField v-if="action === 'freeze'" v-slot="field" :label="$t('owner.centers.freezeReason')" optional>
      <AppTextarea :id="field.id" v-model="reason" :rows="3" maxlength="500" />
    </FormField>
    <template v-else-if="needsNewUntil">
      <AppAlert tone="warning">{{ $t('owner.centers.activateEnded') }}</AppAlert>
      <FormField v-slot="field" :label="$t('owner.centers.newUntil')">
        <AppDatePicker :id="field.id" v-model="until" :min="today" />
      </FormField>
    </template>
  </FormModal>
</template>

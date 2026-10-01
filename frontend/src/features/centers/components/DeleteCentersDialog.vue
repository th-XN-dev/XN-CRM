<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppAlert from '@/components/ui/AppAlert.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import type { BulkCentersResultDto, CenterDto, PurgeResultDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useToastStore } from '@/stores/toast.store';
import { centersApi } from '../api';

/**
 * Permanent deletion of one or more centers. Archived centers only; the
 * owner types the center's address (one) or how many centers (several),
 * so a mis-click can never wipe data. The API checks the same confirmation.
 */
const props = defineProps<{ centers: readonly CenterDto[] }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ deleted: [ids: string[]]; archiveFirst: [centers: CenterDto[]] }>();
const { t } = useI18n();
const toast = useToastStore();
const typed = ref('');
const error = ref<string | null>(null);
watch(open, (value) => {
  if (!value) return;
  typed.value = '';
  error.value = null;
});

const single = computed(() => (props.centers.length === 1 ? props.centers[0] : null));
const expected = computed(() => (single.value ? single.value.slug : String(props.centers.length)));
const notArchived = computed(() => props.centers.filter((c) => c.status !== 'ARCHIVED'));
const shown = computed(() => props.centers.slice(0, 8));
const matches = computed(() => typed.value.trim().toLowerCase() === expected.value);

const run = useApiMutation({
  fn: async (): Promise<PurgeResultDto | BulkCentersResultDto> =>
    single.value
      ? centersApi.remove(single.value.id, typed.value.trim())
      : centersApi.bulk({ action: 'delete', ids: props.centers.map((c) => c.id), confirm: typed.value.trim() }),
  // Not the deleted center's own page: it would refetch into a 404 while closing.
  invalidates: [['owner', 'centers', 'list'], ['owner', 'analytics'], ['owner', 'directors'], ['owner', 'audit']],
  onSuccess: (result) => {
    open.value = false;
    if ('results' in result) {
      toast.success(t('owner.centers.bulk.deleted', { count: result.succeeded }));
      if (result.failed) toast.warning(t('owner.centers.bulk.partly', { failed: result.failed }));
      emit('deleted', result.results.filter((r) => r.ok).map((r) => r.id));
    } else {
      toast.success(t('owner.centers.remove.done', { name: result.name }));
      emit('deleted', [result.id]);
    }
  },
});

async function submit(): Promise<void> {
  error.value = null;
  if (!matches.value) {
    error.value = t('errors.CONFIRMATION_MISMATCH');
    return;
  }
  try {
    await run.mutateAsync();
  } catch (e) {
    error.value = apiErrorMessage(e);
  }
}
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="single ? $t('owner.centers.remove.title', { name: single.name }) : $t('owner.centers.bulk.deleteTitle', { count: centers.length })"
    :submit-label="$t('owner.centers.remove.submit')"
    danger
    size="sm"
    :loading="run.isPending.value"
    :loading-label="$t('common.processing')"
    :submit-disabled="notArchived.length > 0 || !matches"
    :error="error"
    @submit="submit"
  >
    <template v-if="notArchived.length">
      <AppAlert tone="warning">
        {{ single ? $t('owner.centers.remove.archiveFirst') : $t('owner.centers.bulk.notArchived', { count: notArchived.length }) }}
      </AppAlert>
      <AppButton variant="secondary" class="self-start" @click="emit('archiveFirst', notArchived)">{{ $t('owner.centers.bulk.archiveThem') }}</AppButton>
    </template>
    <template v-else>
      <p class="text-sm text-fg-muted">{{ single ? $t('owner.centers.remove.text') : $t('owner.centers.bulk.deleteText') }}</p>
      <ul v-if="!single" class="flex flex-col gap-0.5 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-fg">
        <li v-for="center in shown" :key="center.id" class="truncate">{{ center.name }}</li>
        <li v-if="centers.length > shown.length" class="text-fg-muted">{{ $t('owner.centers.bulk.andMore', { count: centers.length - shown.length }) }}</li>
      </ul>
      <FormField v-slot="field" :label="$t('owner.centers.remove.confirmLabel', { value: expected })">
        <AppInput :id="field.id" v-model="typed" autocomplete="off" autocapitalize="none" spellcheck="false" class="font-mono" :described-by="field.describedBy" />
      </FormField>
    </template>
  </FormModal>
</template>

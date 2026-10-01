<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from '@/composables/useConfirm';
import AppButton from '@/components/ui/AppButton.vue';
import AppModal from '@/components/ui/AppModal.vue';
import FormError from './FormError.vue';

/**
 * A form in a dialog: full screen on phones, centred on desktop. The footer
 * buttons stay visible while the fields scroll; Enter submits. Once the user
 * has typed something, closing asks before throwing it away; while saving the
 * submit button shows progress and cannot be pressed twice.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    submitLabel?: string;
    loading?: boolean;
    error?: string | null;
    size?: 'sm' | 'md' | 'lg';
    danger?: boolean;
    /** Label while saving ("Saving…", "Processing…"). */
    loadingLabel?: string;
    /** The submit button can't be used yet (e.g. a typed confirmation is missing). */
    submitDisabled?: boolean;
  }>(),
  { size: 'md' },
);
const open = defineModel<boolean>('open', { default: false });
defineEmits<{ submit: [event: Event] }>();
const formId = useId();
const { t } = useI18n();
const confirm = useConfirm();
const modal = ref<{ requestClose: () => Promise<void> }>();
/** Any input/change inside the form marks it edited; reset each time the dialog opens. */
const dirty = ref(false);
watch(open, (value) => value && (dirty.value = false));

/** A new form-level error scrolls into view (it sits below the fields on small screens). */
const errorBox = ref<HTMLElement>();
watch(
  () => props.error,
  async (message) => {
    if (!message) return;
    await nextTick();
    errorBox.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },
);

async function guard(): Promise<boolean> {
  if (!dirty.value) return true;
  return confirm({
    title: t('common.unsavedTitle'),
    message: t('common.unsavedText'),
    confirmLabel: t('common.leaveWithoutSaving'),
    danger: true,
  });
}
</script>

<template>
  <AppModal ref="modal" v-model:open="open" :title="title" :description="description" :size="size" :before-close="guard" fullscreen-mobile>
    <form
      :id="formId"
      class="flex flex-col gap-4 pb-1"
      novalidate
      @input="dirty = true"
      @change="dirty = true"
      @submit.prevent="!loading && !submitDisabled && $emit('submit', $event)"
    >
      <slot />
      <div ref="errorBox"><FormError :message="error ?? null" /></div>
    </form>
    <template #footer>
      <AppButton variant="secondary" :disabled="loading" @click="modal?.requestClose()">{{ $t('common.cancel') }}</AppButton>
      <AppButton type="submit" :form="formId" :loading="loading" :disabled="submitDisabled" :variant="danger ? 'danger' : 'primary'">
        {{ loading ? (loadingLabel ?? $t('common.saving')) : (submitLabel ?? $t('common.save')) }}
      </AppButton>
    </template>
  </AppModal>
</template>

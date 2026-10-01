<script setup lang="ts">
import { computed } from 'vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppModal from '@/components/ui/AppModal.vue';
import { useConfirmStore } from '@/composables/useConfirm';

/** The one confirmation dialog of the app, driven by useConfirm(). */
const store = useConfirmStore();
const open = computed({
  get: () => !!store.pending,
  set: (value) => {
    if (!value) store.settle(false);
  },
});
</script>

<template>
  <AppModal v-model:open="open" :title="store.pending?.title ?? ''" :description="store.pending?.message" size="sm">
    <template #footer>
      <!-- The safe choice gets the focus: Enter on a destructive dialog must not destroy. -->
      <AppButton variant="secondary" autofocus @click="store.settle(false)">{{ $t('common.cancel') }}</AppButton>
      <AppButton :variant="store.pending?.danger ? 'danger' : 'primary'" @click="store.settle(true)">
        {{ store.pending?.confirmLabel ?? $t('common.confirm') }}
      </AppButton>
    </template>
  </AppModal>
</template>

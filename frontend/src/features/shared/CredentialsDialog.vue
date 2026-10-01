<script setup lang="ts">
import { computed } from 'vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppModal from '@/components/ui/AppModal.vue';
import CredentialsCard, { type Credentials } from './CredentialsCard.vue';

export type { Credentials };

/** The one-time sign-in details after creating an account or resetting its password. */
const props = defineProps<{ credentials: Credentials | null }>();
const emit = defineEmits<{ close: [] }>();
const open = computed({
  get: () => !!props.credentials,
  set: (value) => !value && emit('close'),
});
</script>

<template>
  <AppModal v-model:open="open" :title="$t('owner.credentials.title')" size="sm" :dismissible="false">
    <CredentialsCard v-if="credentials" :credentials="credentials" />
    <template #footer>
      <AppButton @click="emit('close')">{{ $t('owner.credentials.done') }}</AppButton>
    </template>
  </AppModal>
</template>

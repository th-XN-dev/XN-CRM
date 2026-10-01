<script setup lang="ts">
import { useOnline } from '@vueuse/core';
import { WifiOff } from 'lucide-vue-next';
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToastStore } from '@/stores/toast.store';

/** Shown while the device is offline: reading continues, saving does not. */
const online = useOnline();
const toast = useToastStore();
const { t } = useI18n();
watch(online, (value, previous) => {
  if (value && previous === false) toast.info(t('states.backOnline'));
});
</script>

<template>
  <div
    v-if="!online"
    role="status"
    class="sticky top-0 z-40 flex items-start gap-3 bg-warning px-4 py-2.5 text-sm text-black sm:items-center sm:justify-center"
  >
    <WifiOff class="mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden="true" />
    <p><strong class="font-semibold">{{ $t('states.offlineTitle') }}.</strong> {{ $t('states.offlineText') }}</p>
  </div>
</template>

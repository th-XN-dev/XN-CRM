<script setup lang="ts">
import { CloudOff, Hourglass, LockKeyhole, SearchX, ServerCrash, TriangleAlert, UserX } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import { apiErrorMessage } from '@/composables/useApiErrorMessage';
import { isApiError } from '@/services/api/api-error';

/**
 * One component for every failure a page can hit: network, 401, 403, 404,
 * anything else. Shows what happened in plain words and the next step.
 */
const props = defineProps<{ error?: unknown; kind?: 'forbidden' | 'notFound'; compact?: boolean }>();
defineEmits<{ retry: [] }>();
const { t } = useI18n();

const state = computed(() => {
  const error = isApiError(props.error) ? props.error : null;
  if (props.kind === 'forbidden' || error?.isForbidden) {
    // A specific reason ("You can only open the groups you teach") beats the generic one.
    const specific = error && !['FORBIDDEN', 'PERMISSION_DENIED'].includes(error.code) ? apiErrorMessage(error) : null;
    return { icon: LockKeyhole, title: t('states.forbiddenTitle'), text: specific ?? t('states.forbiddenText'), retry: false };
  }
  if (props.kind === 'notFound' || error?.isNotFound) {
    return { icon: SearchX, title: t('states.notFoundTitle'), text: t('states.notFoundText'), retry: false };
  }
  if (error?.isUnauthorized) {
    return { icon: UserX, title: t('states.unauthorizedTitle'), text: t('states.unauthorizedText'), retry: false };
  }
  if (error?.isNetwork) {
    return { icon: CloudOff, title: t('states.networkTitle'), text: t('states.networkText'), retry: true };
  }
  if (error?.status === 429) {
    return { icon: Hourglass, title: t('states.rateLimitedTitle'), text: apiErrorMessage(error), retry: true };
  }
  if (error && error.status >= 500) {
    return { icon: ServerCrash, title: t('states.serverTitle'), text: apiErrorMessage(error), retry: true };
  }
  return { icon: TriangleAlert, title: t('states.errorTitle'), text: error ? apiErrorMessage(error) : t('states.errorText'), retry: true };
});
const requestId = computed(() => (isApiError(props.error) ? props.error.requestId : undefined));
</script>

<template>
  <div role="alert" class="flex flex-col items-center text-center" :class="compact ? 'py-8' : 'py-14 sm:py-20'">
    <div class="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
      <component :is="state.icon" class="size-7" aria-hidden="true" />
    </div>
    <h2 class="text-base font-semibold text-fg">{{ state.title }}</h2>
    <p class="mt-1 max-w-sm text-sm text-fg-muted">{{ state.text }}</p>
    <p v-if="requestId" class="mt-2 font-mono text-xs text-fg-subtle">{{ $t('states.requestId', { id: requestId }) }}</p>
    <div class="mt-6 flex flex-col gap-2 sm:flex-row">
      <AppButton v-if="state.retry" variant="secondary" @click="$emit('retry')">{{ $t('common.retry') }}</AppButton>
      <slot />
    </div>
  </div>
</template>

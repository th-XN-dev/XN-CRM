<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ComingSoon from '@/components/feedback/ComingSoon.vue';
import PageHeader from '@/components/layout/PageHeader.vue';

/** Route shell for sections built in Frontend Phase 2. */
const props = defineProps<{ featureKey: string }>();
const { t } = useI18n();
const title = computed(() => t(`nav.${props.featureKey}`));
</script>

<template>
  <PageHeader :title="title" />
  <ComingSoon :name="title" />
</template>

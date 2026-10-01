<script setup lang="ts">
import ErrorState from '@/components/feedback/ErrorState.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppCard from '@/components/ui/AppCard.vue';
</script>

<template>
  <AppCard>
    <ErrorState kind="forbidden">
      <AppButton to="/" variant="secondary">{{ $t('states.goHome') }}</AppButton>
    </ErrorState>
  </AppCard>
</template>

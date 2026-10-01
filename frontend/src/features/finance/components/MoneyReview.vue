<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
import AppButton from '@/components/ui/AppButton.vue';

/**
 * The last look before money moves: the amount large, then what it is for.
 * Shown as the second step of payment, refund and cash-desk close.
 */
defineProps<{ amount: string; amountLabel: string; rows: readonly { label: string; value: string }[]; tone?: 'danger' }>();
defineEmits<{ back: [] }>();
</script>

<template>
  <section class="flex flex-col gap-4" aria-live="polite">
    <div class="rounded-2xl p-5 text-center" :class="tone === 'danger' ? 'bg-danger-soft' : 'bg-primary-soft'">
      <p class="text-sm" :class="tone === 'danger' ? 'text-danger' : 'text-primary-soft-fg'">{{ amountLabel }}</p>
      <p class="mt-1 text-3xl font-semibold tracking-tight tabular-nums" :class="tone === 'danger' ? 'text-danger' : 'text-fg'">{{ amount }}</p>
    </div>
    <dl class="flex flex-col divide-y divide-border rounded-2xl border border-border">
      <div v-for="row in rows" :key="row.label" class="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
        <dt class="text-fg-muted">{{ row.label }}</dt>
        <dd class="text-right font-medium text-fg">{{ row.value }}</dd>
      </div>
    </dl>
    <AppButton variant="ghost" size="sm" :icon="ArrowLeft" class="self-start" @click="$emit('back')">{{ $t('finance.review.back') }}</AppButton>
  </section>
</template>

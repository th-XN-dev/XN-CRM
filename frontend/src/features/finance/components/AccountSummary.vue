<script setup lang="ts">
import { computed } from 'vue';
import { useFormatters } from '@/composables/useFormatters';
import { useAccountSummary } from '../queries';

/** Billed / paid / owed for one family or student — the first thing a cashier asks. */
const props = defineProps<{ familyId?: string; studentId?: string }>();
const format = useFormatters();
const summary = useAccountSummary(() => ({ familyId: props.familyId, studentId: props.studentId }));
const debt = computed(() => Number(summary.data.value?.debt ?? 0));
</script>

<template>
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <div class="rounded-2xl border p-4" :class="debt > 0 ? 'border-danger/30 bg-danger-soft' : 'border-border bg-surface'">
      <p class="text-xs font-medium" :class="debt > 0 ? 'text-danger' : 'text-fg-muted'">{{ $t('finance.debt') }}</p>
      <p class="mt-1 text-xl font-semibold tabular-nums" :class="debt > 0 ? 'text-danger' : 'text-fg'">
        <span v-if="summary.isPending.value" class="inline-block h-6 w-24 animate-pulse rounded bg-surface-muted" />
        <template v-else>{{ format.money(summary.data.value?.debt ?? 0) }}</template>
      </p>
      <p v-if="summary.data.value?.overdueCount" class="mt-1 text-xs text-danger">
        {{ $t('finance.overdueInvoices', { count: summary.data.value.overdueCount }, summary.data.value.overdueCount) }}
      </p>
    </div>
    <div class="rounded-2xl border border-border bg-surface p-4">
      <p class="text-xs font-medium text-fg-muted">{{ $t('finance.billed') }}</p>
      <p class="mt-1 text-xl font-semibold text-fg tabular-nums">{{ format.money(summary.data.value?.billed ?? 0) }}</p>
    </div>
    <div class="rounded-2xl border border-border bg-surface p-4">
      <p class="text-xs font-medium text-fg-muted">{{ $t('finance.paid') }}</p>
      <p class="mt-1 text-xl font-semibold text-fg tabular-nums">{{ format.money(summary.data.value?.paid ?? 0) }}</p>
    </div>
    <div class="rounded-2xl border border-border bg-surface p-4">
      <p class="text-xs font-medium text-fg-muted">{{ $t('finance.invoiceCount') }}</p>
      <p class="mt-1 text-xl font-semibold text-fg tabular-nums">{{ summary.data.value?.invoiceCount ?? 0 }}</p>
    </div>
  </div>
</template>

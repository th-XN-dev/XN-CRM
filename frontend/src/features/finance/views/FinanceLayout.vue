<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { P, type PermissionRequirement } from '@/app/config/permissions';
import { usePermission } from '@/composables/usePermission';

/** Finance sub-navigation: a scrollable tab strip (phones) / tab bar (desktop). */
const { t } = useI18n();
const { can } = usePermission();
const route = useRoute();
const sections: { name: string; key: string; permission?: PermissionRequirement }[] = [
  { name: 'finance', key: 'overview' },
  { name: 'finance-invoices', key: 'invoices', permission: P.FINANCE_READ },
  { name: 'finance-payments', key: 'payments', permission: P.FINANCE_PAYMENT_READ },
  { name: 'finance-debtors', key: 'debtors', permission: P.FINANCE_READ },
  { name: 'finance-cash', key: 'cash', permission: P.FINANCE_CASH_READ },
  { name: 'finance-expenses', key: 'expenses', permission: P.FINANCE_EXPENSE_READ },
  { name: 'finance-refunds', key: 'refunds', permission: P.FINANCE_PAYMENT_READ },
];
const visible = computed(() => sections.filter((section) => can(section.permission)).map((s) => ({ ...s, label: t(`finance.sections.${s.key}`) })));
</script>

<template>
  <div>
    <nav :aria-label="$t('nav.finance')" class="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul class="inline-flex gap-1 rounded-xl bg-surface-muted p-1">
        <li v-for="section in visible" :key="section.name">
          <RouterLink
            :to="{ name: section.name }"
            :aria-current="route.name === section.name ? 'page' : undefined"
            class="focus-ring flex h-9 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors"
            :class="route.name === section.name ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'"
          >
            {{ section.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>
    <RouterView />
  </div>
</template>

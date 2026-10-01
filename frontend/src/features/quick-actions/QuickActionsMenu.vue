<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '@/components/ui/AppButton.vue';
import AppDropdown from '@/components/ui/AppDropdown.vue';
import AppDropdownItem from '@/components/ui/AppDropdownItem.vue';
import { usePermission } from '@/composables/usePermission';
import { type QuickAction, quickActions, useQuickActionsStore } from './actions';

/** Header "+" menu: create the usual things from any page. */
const { can } = usePermission();
const router = useRouter();
const store = useQuickActionsStore();
const actions = computed(() => quickActions.filter((action) => can(action.permission)));

function run(action: QuickAction): void {
  if (action.dialog) store.open(action.dialog);
  else if (action.to) void router.push(action.to);
}
</script>

<template>
  <AppDropdown v-if="actions.length" :label="$t('quick.title')" width="w-64">
    <template #trigger="{ toggle, open, menuId }">
      <AppButton icon-only :icon="Plus" :label="$t('quick.title')" :aria-expanded="open" :aria-controls="menuId" aria-haspopup="menu" @click="toggle" />
    </template>
    <AppDropdownItem v-for="action in actions" :key="action.key" :icon="action.icon" @select="run(action)">
      {{ $t(`quick.actions.${action.key}`) }}
    </AppDropdownItem>
  </AppDropdown>
</template>

<script setup lang="ts">
import { Building2, Check, ChevronsUpDown, MapPin } from 'lucide-vue-next';
import AppDropdown from '@/components/ui/AppDropdown.vue';
import AppDropdownItem from '@/components/ui/AppDropdownItem.vue';
import { useContextOptions } from '@/composables/useContextOptions';
import { useContextSwitch } from '@/composables/useContextSwitch';
import { useSessionStore } from '@/stores/session.store';

/** Desktop header: organization and branch switchers (hidden when there is nothing to switch). */
const session = useSessionStore();
const options = useContextOptions();
const { switchOrganization, switchBranch } = useContextSwitch();
const chip =
  'focus-ring flex h-10 max-w-56 items-center gap-2 rounded-xl border border-border bg-surface/70 px-3 text-sm text-fg hover:bg-surface-hover';
</script>

<template>
  <div class="flex items-center gap-2">
    <AppDropdown v-if="options.canSwitchOrganization.value" align="start" :label="$t('header.switchOrganization')">
      <template #trigger="{ toggle, open, menuId }">
        <button type="button" :class="chip" aria-haspopup="menu" :aria-expanded="open" :aria-controls="menuId" @click="toggle">
          <Building2 class="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <span class="sr-only">{{ $t('header.organization') }}:</span>
          <span class="truncate">{{ session.organization?.name }}</span>
          <ChevronsUpDown class="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        </button>
      </template>
      <AppDropdownItem
        v-for="org in options.organizations.value"
        :key="org.id"
        role="menuitemradio"
        :aria-checked="org.id === session.organizationId"
        @select="org.id !== session.organizationId && switchOrganization(org.id)"
      >
        {{ org.name }}
        <template #end><Check v-if="org.id === session.organizationId" class="size-4 text-primary-text" aria-hidden="true" /></template>
      </AppDropdownItem>
    </AppDropdown>

    <AppDropdown v-if="options.canSwitchBranch.value" align="start" :label="$t('header.switchBranch')">
      <template #trigger="{ toggle, open, menuId }">
        <button type="button" :class="chip" aria-haspopup="menu" :aria-expanded="open" :aria-controls="menuId" @click="toggle">
          <MapPin class="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <span class="sr-only">{{ $t('header.branch') }}:</span>
          <span class="truncate">{{ options.currentBranchName.value }}</span>
          <ChevronsUpDown class="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        </button>
      </template>
      <AppDropdownItem
        v-for="branch in options.branchOptions.value"
        :key="branch.id"
        role="menuitemradio"
        :aria-checked="branch.id === session.branchId"
        @select="branch.id !== session.branchId && switchBranch(branch.id)"
      >
        {{ branch.name }}
        <template #end><Check v-if="branch.id === session.branchId" class="size-4 text-primary-text" aria-hidden="true" /></template>
      </AppDropdownItem>
    </AppDropdown>
    <span v-else-if="session.currentBranch" class="hidden items-center gap-2 text-sm text-fg-muted xl:flex">
      <MapPin class="size-4" aria-hidden="true" />{{ session.currentBranch.name }}
    </span>
  </div>
</template>

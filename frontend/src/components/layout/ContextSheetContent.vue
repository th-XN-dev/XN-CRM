<script setup lang="ts">
import { Check } from 'lucide-vue-next';
import { useContextOptions } from '@/composables/useContextOptions';
import { useContextSwitch } from '@/composables/useContextSwitch';
import { useSessionStore } from '@/stores/session.store';

/** Mobile: organization and branch as simple radio lists inside the drawer. */
const emit = defineEmits<{ done: [] }>();
const session = useSessionStore();
const options = useContextOptions();
const { switchOrganization, switchBranch } = useContextSwitch();

async function pickOrganization(id: string): Promise<void> {
  if (id !== session.organizationId) await switchOrganization(id);
  emit('done');
}
async function pickBranch(id: string): Promise<void> {
  if (id !== session.branchId) await switchBranch(id);
  emit('done');
}
const row =
  'focus-ring flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-surface-hover';
</script>

<template>
  <div class="space-y-4">
    <section v-if="options.canSwitchOrganization.value">
      <h3 class="px-3 pb-1 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{{ $t('header.organization') }}</h3>
      <button
        v-for="org in options.organizations.value"
        :key="org.id"
        type="button"
        :class="row"
        :aria-pressed="org.id === session.organizationId"
        @click="pickOrganization(org.id)"
      >
        <span class="min-w-0 flex-1 truncate" :class="org.id === session.organizationId && 'font-semibold'">{{ org.name }}</span>
        <Check v-if="org.id === session.organizationId" class="size-4 text-primary-text" aria-hidden="true" />
      </button>
    </section>
    <section v-if="options.canSwitchBranch.value">
      <h3 class="px-3 pb-1 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{{ $t('header.branch') }}</h3>
      <button
        v-for="branch in options.branchOptions.value"
        :key="branch.id"
        type="button"
        :class="row"
        :aria-pressed="branch.id === session.branchId"
        @click="pickBranch(branch.id)"
      >
        <span class="min-w-0 flex-1 truncate" :class="branch.id === session.branchId && 'font-semibold'">{{ branch.name }}</span>
        <Check v-if="branch.id === session.branchId" class="size-4 text-primary-text" aria-hidden="true" />
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, Search } from 'lucide-vue-next';
import BrandLogo from '@/components/ui/BrandLogo.vue';
import { useContextOptions } from '@/composables/useContextOptions';
import { useSessionStore } from '@/stores/session.store';
import QuickActionsMenu from '@/features/quick-actions/QuickActionsMenu.vue';
import ContextMenus from './ContextMenus.vue';
import NotificationBell from './NotificationBell.vue';
import UserMenu from './UserMenu.vue';

defineEmits<{ openContext: []; openSearch: [] }>();
const session = useSessionStore();
const options = useContextOptions();
</script>

<template>
  <header
    class="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:top-3 lg:mx-3 lg:mt-3 lg:rounded-2xl lg:border-x lg:border-t lg:px-4"
  >
    <!-- Mobile: logo + current context (tap to switch). -->
    <div class="flex min-w-0 flex-1 items-center gap-3 lg:hidden">
      <BrandLogo :name="session.organization?.name ?? $t('app.name')" :logo-url="session.organization?.logoUrl" size="sm" />
      <button
        v-if="options.canSwitchOrganization.value || options.canSwitchBranch.value"
        type="button"
        class="focus-ring flex min-h-11 min-w-0 items-center gap-1 rounded-lg text-left"
        :aria-label="`${$t('header.switchOrganization')} / ${$t('header.switchBranch')}`"
        @click="$emit('openContext')"
      >
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-fg">{{ session.organization?.name }}</span>
          <span class="block truncate text-xs text-fg-muted">{{ options.currentBranchName.value }}</span>
        </span>
        <ChevronDown class="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
      </button>
      <span v-else class="min-w-0">
        <span class="block truncate text-sm font-semibold text-fg">{{ session.organization?.name }}</span>
        <span class="block truncate text-xs text-fg-muted">{{ options.currentBranchName.value }}</span>
      </span>
    </div>

    <!-- Desktop: switchers. -->
    <div class="hidden min-w-0 flex-1 lg:flex">
      <ContextMenus />
    </div>

    <div class="flex items-center gap-1 sm:gap-2">
      <button
        type="button"
        class="focus-ring hidden h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-fg-muted hover:text-fg md:inline-flex"
        @click="$emit('openSearch')"
      >
        <Search class="size-4" aria-hidden="true" />
        <span>{{ $t('search.button') }}</span>
        <kbd class="ml-4 rounded border border-border px-1 text-xs">⌘K</kbd>
      </button>
      <button
        type="button"
        class="focus-ring inline-flex size-11 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-hover hover:text-fg md:hidden"
        :aria-label="$t('search.button')"
        @click="$emit('openSearch')"
      >
        <Search class="size-5" aria-hidden="true" />
      </button>
      <QuickActionsMenu />
      <NotificationBell />
      <UserMenu />
    </div>
  </header>
</template>

<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next';
import BrandLogo from '@/components/ui/BrandLogo.vue';
import { useNavigation } from '@/composables/useNavigation';
import { usePreferencesStore } from '@/stores/preferences.store';
import { useSessionStore } from '@/stores/session.store';
import NavLink from './NavLink.vue';

const { sections } = useNavigation();
const session = useSessionStore();
const preferences = usePreferencesStore();
</script>

<template>
  <aside
    class="glass sticky top-3 m-3 mr-0 flex h-[calc(100dvh-1.5rem)] shrink-0 flex-col rounded-3xl transition-[width] duration-200"
    :class="preferences.sidebarCollapsed ? 'w-[4.75rem] items-center' : 'w-64'"
  >
    <div class="flex items-center gap-3 p-4" :class="preferences.sidebarCollapsed && 'justify-center px-0'">
      <BrandLogo :name="session.organization?.name ?? $t('app.name')" :logo-url="session.organization?.logoUrl" />
      <div v-if="!preferences.sidebarCollapsed" class="min-w-0">
        <p class="truncate text-sm font-semibold text-fg">{{ session.organization?.name ?? $t('app.name') }}</p>
        <p class="truncate text-xs text-fg-muted">{{ $t('app.name') }}</p>
      </div>
    </div>

    <nav :aria-label="$t('nav.main')" class="flex-1 overflow-y-auto px-3 pb-3">
      <div v-for="group in sections" :key="group.section" class="mb-3">
        <p v-if="!preferences.sidebarCollapsed && group.section !== 'main'" class="px-3 pt-1 pb-1.5 text-[0.7rem] font-semibold tracking-wider text-fg-subtle uppercase">
          {{ $t(`nav.sections.${group.section}`) }}
        </p>
        <div v-else-if="group.section !== 'main'" class="mx-auto mb-2 h-px w-8 bg-border" aria-hidden="true" />
        <ul class="flex flex-col gap-0.5" :class="preferences.sidebarCollapsed && 'items-center'">
          <li v-for="item in group.items" :key="item.key">
            <NavLink :item="item" :collapsed="preferences.sidebarCollapsed" />
          </li>
        </ul>
      </div>
    </nav>

    <div class="border-t border-border p-3">
      <button
        type="button"
        class="focus-ring flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
        :class="preferences.sidebarCollapsed && 'justify-center px-0'"
        :aria-label="preferences.sidebarCollapsed ? $t('nav.expand') : $t('nav.collapse')"
        :aria-expanded="!preferences.sidebarCollapsed"
        @click="preferences.sidebarCollapsed = !preferences.sidebarCollapsed"
      >
        <component :is="preferences.sidebarCollapsed ? PanelLeftOpen : PanelLeftClose" class="size-5" aria-hidden="true" />
        <span v-if="!preferences.sidebarCollapsed">{{ $t('nav.collapse') }}</span>
      </button>
    </div>
  </aside>
</template>

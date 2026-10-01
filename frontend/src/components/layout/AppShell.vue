<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue';
import OfflineBanner from '@/components/feedback/OfflineBanner.vue';
import { useNotificationFeed } from '@/features/notifications/api';
import AppHeader from './AppHeader.vue';
import AppSidebar from './AppSidebar.vue';
import MobileTabBar from './MobileTabBar.vue';
import NavDrawer from './NavDrawer.vue';

const CommandPalette = defineAsyncComponent(() => import('@/features/search/CommandPalette.vue'));
const QuickActionsHost = defineAsyncComponent(() => import('@/features/quick-actions/QuickActionsHost.vue'));

const drawerOpen = ref(false);
const drawerMode = ref<'menu' | 'context'>('menu');
const searchOpen = ref(false);
useNotificationFeed();

function openDrawer(mode: 'menu' | 'context'): void {
  drawerMode.value = mode;
  drawerOpen.value = true;
}
</script>

<template>
  <a
    href="#main"
    class="focus-ring sr-only z-50 rounded-xl bg-surface px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
  >
    {{ $t('app.skipToContent') }}
  </a>
  <OfflineBanner />
  <div class="min-h-dvh lg:flex">
    <AppSidebar class="hidden lg:flex" />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppHeader @open-context="openDrawer('context')" @open-search="searchOpen = true" />
      <main id="main" tabindex="-1" class="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-28 outline-none sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
        <RouterView />
      </main>
    </div>
    <MobileTabBar class="lg:hidden" @more="openDrawer('menu')" />
    <NavDrawer v-model:open="drawerOpen" :mode="drawerMode" />
    <CommandPalette v-model:open="searchOpen" />
    <QuickActionsHost />
  </div>
</template>

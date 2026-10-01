<script setup lang="ts">
import { Menu } from 'lucide-vue-next';
import { ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import OfflineBanner from '@/components/feedback/OfflineBanner.vue';
import UserMenu from '@/components/layout/UserMenu.vue';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import BrandLogo from '@/components/ui/BrandLogo.vue';
import { ownerNavigation } from './navigation';

/** The platform owner's layout: XN CRM's own brand and menu, no center or branch switchers. */
const route = useRoute();
const menuOpen = ref(false);
const isActive = (to: string) => (to === '/owner' ? route.path === '/owner' : route.path === to || route.path.startsWith(`${to}/`));
watch(() => route.fullPath, () => (menuOpen.value = false));
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
    <aside class="glass sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] w-64 shrink-0 flex-col rounded-3xl lg:flex">
      <div class="flex items-center gap-3 p-4">
        <BrandLogo :name="$t('app.name')" />
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-fg">{{ $t('app.name') }}</p>
          <p class="truncate text-xs text-fg-muted">{{ $t('owner.area') }}</p>
        </div>
      </div>
      <nav :aria-label="$t('owner.nav.label')" class="flex-1 overflow-y-auto px-3 pb-3">
        <ul class="flex flex-col gap-0.5">
          <li v-for="item in ownerNavigation" :key="item.key">
            <RouterLink
              :to="item.to"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              class="focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors"
              :class="isActive(item.to) ? 'bg-primary text-primary-fg shadow-sm' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'"
            >
              <component :is="item.icon" class="size-5 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ $t(`owner.nav.${item.key}`) }}</span>
            </RouterLink>
          </li>
        </ul>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:top-3 lg:mx-3 lg:mt-3 lg:rounded-2xl lg:border-x lg:border-t lg:px-4"
      >
        <button
          type="button"
          class="focus-ring inline-flex size-11 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-hover hover:text-fg lg:hidden"
          :aria-label="$t('owner.nav.label')"
          aria-haspopup="dialog"
          @click="menuOpen = true"
        >
          <Menu class="size-5" aria-hidden="true" />
        </button>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-fg">{{ $t('owner.area') }}</p>
        </div>
        <UserMenu />
      </header>
      <main id="main" tabindex="-1" class="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-12 outline-none sm:px-6 lg:px-8 lg:pt-8">
        <RouterView />
      </main>
    </div>

    <AppDrawer v-model:open="menuOpen" :title="$t('owner.nav.label')">
      <nav :aria-label="$t('owner.nav.label')">
        <ul class="flex flex-col gap-0.5">
          <li v-for="item in ownerNavigation" :key="item.key">
            <RouterLink
              :to="item.to"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              class="focus-ring flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium"
              :class="isActive(item.to) ? 'bg-primary text-primary-fg' : 'text-fg hover:bg-surface-hover'"
            >
              <component :is="item.icon" class="size-5 shrink-0" aria-hidden="true" />
              {{ $t(`owner.nav.${item.key}`) }}
            </RouterLink>
          </li>
        </ul>
      </nav>
    </AppDrawer>
  </div>
</template>

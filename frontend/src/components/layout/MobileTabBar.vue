<script setup lang="ts">
import { Menu } from 'lucide-vue-next';
import { RouterLink, useRoute } from 'vue-router';
import { useNavigation } from '@/composables/useNavigation';

/** Phone navigation: the (up to) four most used sections + "More" for everything else. */
defineEmits<{ more: [] }>();
const { primaryItems } = useNavigation();
const route = useRoute();
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to));
const tab =
  'focus-ring flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.7rem] font-medium';
</script>

<template>
  <nav
    :aria-label="$t('nav.main')"
    class="glass fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
  >
    <ul class="flex">
      <li v-for="item in primaryItems" :key="item.key" class="flex flex-1">
        <RouterLink
          :to="item.to"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          :class="[tab, isActive(item.to) ? 'text-primary-text' : 'text-fg-muted']"
        >
          <span
            class="inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors"
            :class="isActive(item.to) && 'bg-primary-soft'"
          >
            <component :is="item.icon" class="size-5" aria-hidden="true" />
          </span>
          <span class="max-w-full truncate px-1">{{ $t(`nav.${item.key}`) }}</span>
        </RouterLink>
      </li>
      <li class="flex flex-1">
        <button type="button" :class="[tab, 'text-fg-muted']" @click="$emit('more')">
          <span class="inline-flex h-7 w-12 items-center justify-center"><Menu class="size-5" aria-hidden="true" /></span>
          <span>{{ $t('common.more') }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

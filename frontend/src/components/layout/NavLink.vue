<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import AppTooltip from '@/components/ui/AppTooltip.vue';
import type { NavItem } from '@/app/config/navigation';

const props = defineProps<{ item: NavItem; collapsed?: boolean }>();
const route = useRoute();
const active = computed(() =>
  props.item.to === '/' ? route.path === '/' : route.path === props.item.to || route.path.startsWith(`${props.item.to}/`),
);
</script>

<template>
  <AppTooltip v-if="collapsed" :text="$t(`nav.${item.key}`)" side="right">
    <RouterLink
      :to="item.to"
      :aria-label="$t(`nav.${item.key}`)"
      :aria-current="active ? 'page' : undefined"
      class="focus-ring flex size-11 items-center justify-center rounded-xl transition-colors"
      :class="active ? 'bg-primary text-primary-fg shadow-sm' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'"
    >
      <component :is="item.icon" class="size-5" aria-hidden="true" />
    </RouterLink>
  </AppTooltip>
  <RouterLink
    v-else
    :to="item.to"
    :aria-current="active ? 'page' : undefined"
    class="focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors"
    :class="active ? 'bg-primary text-primary-fg shadow-sm' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'"
  >
    <component :is="item.icon" class="size-5 shrink-0" aria-hidden="true" />
    <span class="truncate">{{ $t(`nav.${item.key}`) }}</span>
  </RouterLink>
</template>

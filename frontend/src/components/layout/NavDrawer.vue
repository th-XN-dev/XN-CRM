<script setup lang="ts">
import { LogOut } from 'lucide-vue-next';
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import { useNavigation } from '@/composables/useNavigation';
import { useSignOut } from '@/composables/useSignOut';
import { useSessionStore } from '@/stores/session.store';
import ContextSheetContent from './ContextSheetContent.vue';
import NavLink from './NavLink.vue';

/** Phone: the full menu (and the context switcher when opened from the header). */
const props = defineProps<{ mode: 'menu' | 'context' }>();
const open = defineModel<boolean>('open', { default: false });
const { sections } = useNavigation();
const session = useSessionStore();
const route = useRoute();
const signOut = useSignOut();

watch(
  () => route.fullPath,
  () => (open.value = false),
);
</script>

<template>
  <AppDrawer
    v-model:open="open"
    :title="props.mode === 'context' ? $t('header.switchOrganization') : (session.organization?.name ?? $t('nav.main'))"
    :side="props.mode === 'context' ? 'right' : 'left'"
  >
    <ContextSheetContent v-if="props.mode === 'context'" @done="open = false" />
    <template v-else>
      <nav :aria-label="$t('nav.main')">
        <div v-for="group in sections" :key="group.section" class="mb-3">
          <p v-if="group.section !== 'main'" class="px-3 pt-1 pb-1.5 text-[0.7rem] font-semibold tracking-wider text-fg-subtle uppercase">
            {{ $t(`nav.sections.${group.section}`) }}
          </p>
          <ul class="flex flex-col gap-0.5">
            <li v-for="item in group.items" :key="item.key"><NavLink :item="item" /></li>
          </ul>
        </div>
      </nav>
      <div class="mt-4 border-t border-border pt-4">
        <button
          type="button"
          class="focus-ring flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-danger hover:bg-danger-soft"
          @click="signOut"
        >
          <LogOut class="size-5" aria-hidden="true" />
          {{ $t('auth.logout') }}
        </button>
      </div>
    </template>
  </AppDrawer>
</template>

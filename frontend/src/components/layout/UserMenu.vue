<script setup lang="ts">
import { Building2, Check, Crown, LogOut, Monitor, Moon, Settings, Sun, UserRound } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { appConfig } from '@/app/config/app.config';
import AppAvatar from '@/components/ui/AppAvatar.vue';
import AppDropdown from '@/components/ui/AppDropdown.vue';
import AppDropdownItem from '@/components/ui/AppDropdownItem.vue';
import { useSignOut } from '@/composables/useSignOut';
import { useTheme, type ThemePreference } from '@/composables/useTheme';
import { usePreferencesStore } from '@/stores/preferences.store';
import { useAuthStore } from '@/stores/auth.store';
import type { Locale } from '@/types/domain';

const auth = useAuthStore();
const preferences = usePreferencesStore();
const router = useRouter();
const route = useRoute();
/** In the owner's area (no center): profile lives there and there are no center settings. */
const inOwnerArea = computed(() => route.matched.some((record) => record.meta.platform));
const isOwner = computed(() => auth.profile?.platformRole === 'OWNER');
const { preference } = useTheme();
const signOut = useSignOut();
const themes: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];
const locales = appConfig.locales;

function chooseLocale(locale: Locale): void {
  preferences.chooseLocale(locale);
}
</script>

<template>
  <AppDropdown :label="$t('header.account')" width="w-72">
    <template #trigger="{ toggle, open, menuId }">
      <button
        type="button"
        class="focus-ring rounded-full"
        :aria-label="$t('header.account')"
        aria-haspopup="menu"
        :aria-expanded="open"
        :aria-controls="menuId"
        @click="toggle"
      >
        <AppAvatar :name="auth.profile?.name ?? ''" size="sm" />
      </button>
    </template>

    <div class="px-3 py-2">
      <p class="truncate text-sm font-semibold text-fg">{{ auth.profile?.name }}</p>
      <p class="truncate text-xs text-fg-muted">{{ auth.profile?.email ?? auth.profile?.phone }}</p>
    </div>
    <div class="my-1 h-px bg-border" role="separator" />
    <p class="px-3 pt-1 pb-0.5 text-xs font-semibold text-fg-subtle" aria-hidden="true">{{ $t('theme.title') }}</p>
    <AppDropdownItem
      v-for="theme in themes"
      :key="theme.value"
      role="menuitemradio"
      :aria-checked="preference === theme.value"
      :icon="theme.icon"
      @select="preference = theme.value"
    >
      {{ $t(`theme.${theme.value}`) }}
      <template #end><Check v-if="preference === theme.value" class="size-4 text-primary-text" aria-hidden="true" /></template>
    </AppDropdownItem>
    <div class="my-1 h-px bg-border" role="separator" />
    <p class="px-3 pt-1 pb-0.5 text-xs font-semibold text-fg-subtle" aria-hidden="true">{{ $t('language.title') }}</p>
    <AppDropdownItem
      v-for="locale in locales"
      :key="locale"
      role="menuitemradio"
      :aria-checked="$i18n.locale === locale"
      inset
      @select="chooseLocale(locale)"
    >
      {{ $t(`language.${locale}`) }}
      <template #end><Check v-if="$i18n.locale === locale" class="size-4 text-primary-text" aria-hidden="true" /></template>
    </AppDropdownItem>
    <div class="my-1 h-px bg-border" role="separator" />
    <AppDropdownItem :icon="UserRound" @select="router.push(inOwnerArea ? '/owner/profile' : '/profile')">{{ $t('account.menu.profile') }}</AppDropdownItem>
    <AppDropdownItem v-if="!inOwnerArea" :icon="Settings" @select="router.push('/settings')">{{ $t('nav.settings') }}</AppDropdownItem>
    <AppDropdownItem v-if="isOwner && !inOwnerArea" :icon="Crown" @select="router.push('/owner')">{{ $t('account.menu.ownerArea') }}</AppDropdownItem>
    <AppDropdownItem v-if="inOwnerArea && auth.profile?.organizations.length" :icon="Building2" @select="router.push('/')">{{ $t('account.menu.centerArea') }}</AppDropdownItem>
    <AppDropdownItem :icon="LogOut" danger @select="signOut">{{ $t('auth.logout') }}</AppDropdownItem>
  </AppDropdown>
</template>

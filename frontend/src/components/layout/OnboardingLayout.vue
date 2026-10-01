<script setup lang="ts">
import { Monitor, Moon, Sun } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { appConfig } from '@/app/config/app.config';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import { useTheme } from '@/composables/useTheme';
import { usePreferencesStore } from '@/stores/preferences.store';
import type { Locale } from '@/types/domain';

/** Sign-in and organization/branch selection: one focused card, nothing else. */
defineProps<{ title: string; subtitle?: string; wide?: boolean }>();
const { preference } = useTheme();
const preferences = usePreferencesStore();
const { t, locale } = useI18n();

const themeOptions = computed(() => [
  { value: 'light', label: t('theme.light'), icon: Sun },
  { value: 'dark', label: t('theme.dark'), icon: Moon },
  { value: 'system', label: t('theme.system'), icon: Monitor },
]);
const theme = computed({
  get: () => preference.value,
  set: (value: string) => (preference.value = value as typeof preference.value),
});
const language = computed({
  get: () => locale.value,
  set: (value: string) => preferences.chooseLocale(value as Locale),
});
const languageOptions = computed(() => appConfig.locales.map((code) => ({ value: code, label: code.toUpperCase() })));
</script>

<template>
  <div class="flex min-h-dvh flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-semibold text-fg">{{ $t('app.name') }}</span>
      <div class="flex items-center gap-2">
        <SegmentedControl v-model="language" :options="languageOptions" :label="$t('language.title')" name="onboarding-language" />
        <SegmentedControl
          v-model="theme"
          :options="themeOptions"
          icon-only
          :label="$t('theme.title')"
          name="onboarding-theme"
          class="hidden sm:inline-flex"
        />
      </div>
    </div>
    <main id="main" class="flex flex-1 items-center justify-center py-8">
      <div class="glass w-full rounded-3xl p-6 sm:p-8" :class="wide ? 'max-w-lg' : 'max-w-md'">
        <h1 class="text-2xl font-semibold tracking-tight text-fg">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 text-sm text-fg-muted">{{ subtitle }}</p>
        <div class="mt-6"><slot /></div>
      </div>
    </main>
  </div>
</template>

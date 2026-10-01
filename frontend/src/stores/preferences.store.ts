import { useLocalStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { watch } from 'vue';
import { storageKeys } from '@/app/config/app.config';
import { isLocale, setLocale } from '@/i18n';
import type { Locale } from '@/types/domain';

/**
 * Per-device UI preferences. Language: the user's explicit choice wins, else
 * the organization's default language, else the browser's, else Uzbek.
 */
export const usePreferencesStore = defineStore('preferences', () => {
  const chosenLocale = useLocalStorage<Locale | null>(storageKeys.locale, null);
  const sidebarCollapsed = useLocalStorage(storageKeys.sidebarCollapsed, false);

  function browserLocale(): Locale | null {
    const candidate = navigator.language.slice(0, 2).toLowerCase();
    return isLocale(candidate) ? candidate : null;
  }

  function resolveLocale(organizationLanguage?: string | null): Locale {
    if (chosenLocale.value && isLocale(chosenLocale.value)) return chosenLocale.value;
    if (isLocale(organizationLanguage)) return organizationLanguage;
    return browserLocale() ?? 'uz';
  }

  function chooseLocale(locale: Locale): void {
    chosenLocale.value = locale;
    void setLocale(locale);
  }

  watch(chosenLocale, (value) => {
    if (value && isLocale(value)) void setLocale(value);
  });

  return { chosenLocale, sidebarCollapsed, resolveLocale, chooseLocale };
});

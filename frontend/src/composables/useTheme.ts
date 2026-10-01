import { useColorMode } from '@vueuse/core';
import { computed } from 'vue';
import { storageKeys } from '@/app/config/app.config';

export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Light / Dark / System. "System" follows the OS live. The choice is stored
 * per device; the `dark` class on <html> switches the token set.
 */
export function useTheme() {
  const mode = useColorMode({
    attribute: 'class',
    modes: { light: 'light', dark: 'dark' },
    storageKey: storageKeys.theme,
    initialValue: 'auto',
    disableTransition: true,
  });

  const preference = computed<ThemePreference>({
    get: () => (mode.store.value === 'auto' ? 'system' : (mode.store.value as ThemePreference)),
    set: (value) => {
      mode.store.value = value === 'system' ? 'auto' : value;
    },
  });
  const isDark = computed(() => mode.state.value === 'dark');

  return { preference, isDark };
}

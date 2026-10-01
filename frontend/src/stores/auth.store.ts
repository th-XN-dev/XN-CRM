import { useLocalStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { storageKeys } from '@/app/config/app.config';
import { authApi } from '@/features/auth/api';
import { singleFlight } from '@/lib/single-flight';
import type { Profile, TokenPair } from '@/types/domain';

/**
 * Session tokens and the signed-in user.
 * - Access token: memory only (never persisted).
 * - Refresh token: localStorage, so a reload restores the session; it is
 *   rotated on every refresh and revoked on sign-out.
 */
export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const refreshToken = useLocalStorage<string | null>(storageKeys.refreshToken, null);
  const profile = ref<Profile | null>(null);
  let restored: Promise<void> | null = null;
  /** The refresh token the last restore ran for (a new one, e.g. from another tab, restores again). */
  let restoredFor: string | null = null;

  const isAuthenticated = computed(() => !!accessToken.value && !!profile.value);

  function setTokens(tokens: TokenPair): void {
    accessToken.value = tokens.accessToken;
    refreshToken.value = tokens.refreshToken;
  }

  function clear(): void {
    accessToken.value = null;
    refreshToken.value = null;
    profile.value = null;
    restored = null;
  }

  async function loadProfile(): Promise<Profile> {
    profile.value = await authApi.me();
    return profile.value;
  }

  async function login(login: string, password: string): Promise<void> {
    const result = await authApi.login(login, password);
    setTokens(result.tokens);
    await loadProfile();
  }

  async function register(input: { name: string; email?: string; phone?: string; password: string }): Promise<void> {
    const result = await authApi.register(input);
    setTokens(result.tokens);
    await loadProfile();
  }

  /**
   * Shared by all requests of this tab that hit 401 at the same time, and
   * serialized across tabs (Web Locks): refresh tokens rotate, so two tabs
   * refreshing with the same token would trip the server's reuse detection
   * and sign the user out everywhere. Inside the lock the token is re-read
   * from storage — another tab may have just rotated it.
   */
  const refresh = singleFlight(async (): Promise<string | null> => {
    const run = async (): Promise<string | null> => {
      const token = localStorage.getItem(storageKeys.refreshToken) ?? refreshToken.value;
      if (!token) return null;
      try {
        setTokens(await authApi.refresh(token));
        return accessToken.value;
      } catch {
        clear();
        return null;
      }
    };
    return typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('xn.auth.refresh', run)
      : run();
  });

  /** Once per page load: turns a stored refresh token back into a session. */
  function restore(): Promise<void> {
    if (!accessToken.value && refreshToken.value && refreshToken.value !== restoredFor) restored = null;
    restoredFor = refreshToken.value;
    restored ??= (async () => {
      if (accessToken.value || !refreshToken.value) return;
      if (await refresh()) {
        await loadProfile().catch(() => clear());
      }
    })();
    return restored;
  }

  async function logout(): Promise<void> {
    const token = refreshToken.value;
    clear();
    if (token) await authApi.logout(token).catch(() => undefined);
  }

  return {
    accessToken,
    profile,
    isAuthenticated,
    login,
    register,
    logout,
    refresh,
    restore,
    loadProfile,
    clear,
  };
});

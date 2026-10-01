import { useSessionStorage } from '@vueuse/core';
import { computed } from 'vue';
import { useSessionStore } from '@/stores/session.store';
import type { SearchResult } from './providers';

const MAX = 6;
export interface RecentResult extends SearchResult {
  group: string;
}

/**
 * Records opened from search, newest first. Kept in sessionStorage (gone when
 * the tab closes, never shared across organizations or users) — names of
 * students are personal data and do not belong in long-lived storage.
 */
export function useRecentResults() {
  const session = useSessionStore();
  const store = useSessionStorage<Record<string, RecentResult[]>>('xn.search.recent', {});
  const key = computed(() => `${session.context?.organization.id ?? ''}`);
  const items = computed(() => store.value[key.value] ?? []);

  function remember(result: RecentResult): void {
    const rest = items.value.filter((item) => !(item.id === result.id && item.group === result.group));
    store.value = { ...store.value, [key.value]: [result, ...rest].slice(0, MAX) };
  }

  return { items, remember };
}

/** On sign-out. */
export function clearRecentResults(): void {
  sessionStorage.removeItem('xn.search.recent');
}

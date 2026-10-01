import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/** The open tab of a record page lives in `?tab=`: reload and back keep it. */
export function useRouteTab(available: MaybeRefOrGetter<readonly string[]>, fallback: string) {
  const route = useRoute();
  const router = useRouter();
  return computed({
    get: () => {
      const tab = String(route.query.tab ?? '');
      return toValue(available).includes(tab) ? tab : fallback;
    },
    set: (tab: string) => {
      void router.replace({ query: { ...route.query, tab: tab === fallback ? undefined : tab } });
    },
  });
}

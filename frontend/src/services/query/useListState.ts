import { computed, reactive, watch } from 'vue';
import { type LocationQuery, useRoute, useRouter } from 'vue-router';

type ListValue = string | number | boolean;

/**
 * List filters, search, sort and page kept in the URL: back/forward and
 * shared links restore exactly what the employee was looking at. Changing any
 * filter resets the page to 1.
 */
export function useListState<T extends Record<string, ListValue>>(
  defaults: T,
  /** Keys that count as filters (the "Filters (n)" badge); default: all but page/search/sort. */
  filterKeys?: readonly (keyof T & string)[],
) {
  const route = useRoute();
  const router = useRouter();

  const read = (query: LocationQuery): T => {
    const state = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      const raw = query[key];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value === undefined || value === null) continue;
      const fallback = defaults[key];
      state[key] = (
        typeof fallback === 'number'
          ? Number(value) || fallback
          : typeof fallback === 'boolean'
            ? value === 'true'
            : value
      ) as T[typeof key];
    }
    return state;
  };

  const state = reactive(read(route.query)) as T;

  watch(
    () => route.query,
    (query) => Object.assign(state, read(query)),
  );

  function write(): void {
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(state)) {
      if (value !== defaults[key] && value !== '') query[key] = String(value);
    }
    // Other keys of the URL (e.g. an open tab) stay untouched.
    const others = Object.fromEntries(
      Object.entries(route.query).filter(([key]) => !(key in defaults)),
    );
    void router.replace({ query: { ...others, ...query } });
  }

  function set(patch: Partial<T>): void {
    const resetsPage = Object.keys(patch).some((key) => key !== 'page');
    Object.assign(state, patch);
    if (resetsPage && 'page' in defaults) (state as Record<string, ListValue>).page = 1;
    write();
  }

  function reset(): void {
    Object.assign(state, defaults);
    write();
  }

  /** Filters differing from their default (search and page excluded) — the "Filters (2)" badge. */
  const activeFilters = computed(
    () =>
      Object.entries(state).filter(
        ([key, value]) =>
          (filterKeys ? filterKeys.includes(key) : !['page', 'search', 'sortBy', 'sortOrder'].includes(key)) &&
          value !== defaults[key],
      ).length,
  );

  /** API params: defaults and empty strings dropped. */
  const params = computed(() =>
    Object.fromEntries(Object.entries(state).filter(([, value]) => value !== '')),
  );

  return { state: state as Readonly<T>, set, reset, activeFilters, params };
}

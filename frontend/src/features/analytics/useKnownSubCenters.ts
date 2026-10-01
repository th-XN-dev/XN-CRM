import { computed, reactive, watch, type Ref } from 'vue';
import type { CenterAnalyticsDto } from '@/services/api/schema.gen';

/**
 * Sub-center filter options from analytics answers. A filtered answer only
 * contains the chosen sub-center, so options seen before are kept (and the
 * filter can be switched without another request).
 */
export function useKnownSubCenters(data: Ref<CenterAnalyticsDto | undefined>) {
  const known = reactive(new Map<string, string>());
  watch(
    () => data.value?.subCenters,
    (list) => list?.forEach((s) => s.id && s.name && known.set(s.id, s.name)),
    { immediate: true },
  );
  return computed(() => [...known].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)));
}

import { computed } from 'vue';
import { NAV_SECTIONS, navigation } from '@/app/config/navigation';
import { useSessionStore } from '@/stores/session.store';

/** Menu items the current member may open (sidebar, mobile bar, drawer). */
export function useNavigation() {
  const session = useSessionStore();
  const items = computed(() => navigation.filter((item) => session.can(item.permission)));
  const primaryItems = computed(() =>
    items.value
      .filter((item) => item.primary !== undefined)
      .sort((a, b) => (a.primary ?? 0) - (b.primary ?? 0))
      .slice(0, 4),
  );
  /** Items grouped by section, empty sections dropped. */
  const sections = computed(() =>
    NAV_SECTIONS.map((section) => ({ section, items: items.value.filter((item) => item.section === section) })).filter(
      (group) => group.items.length > 0,
    ),
  );
  return { items, primaryItems, sections };
}

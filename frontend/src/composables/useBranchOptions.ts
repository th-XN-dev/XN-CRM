import { computed } from 'vue';
import type { SelectOption } from '@/components/ui/AppSelect.vue';
import { useSessionStore } from '@/stores/session.store';

/**
 * Branches the member works in, for forms and filters. New records default to
 * the branch selected in the header (or the only one there is).
 */
export function useBranchOptions() {
  const session = useSessionStore();
  const options = computed<SelectOption[]>(() =>
    session.branches.map((branch) => ({ value: branch.id, label: branch.name })),
  );
  const defaultId = computed(() => session.apiBranchId ?? session.branches[0]?.id ?? '');
  /** Filters only make sense when "All branches" is selected and there are several. */
  const showFilter = computed(() => !session.apiBranchId && session.branches.length > 1);
  const nameOf = (id: string | null | undefined) =>
    session.branches.find((branch) => branch.id === id)?.name ?? '';
  return { options, defaultId, showFilter, nameOf };
}

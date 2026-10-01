import type { PermissionRequirement } from '@/app/config/permissions';
import { useSessionStore } from '@/stores/session.store';

/** `can(P.STUDENTS_CREATE)` — UI visibility only; the API enforces access. */
export function usePermission() {
  const session = useSessionStore();
  return {
    can: (requirement: PermissionRequirement | undefined) => session.can(requirement),
  };
}

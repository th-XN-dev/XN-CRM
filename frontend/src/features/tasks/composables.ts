import { P } from '@/app/config/permissions';
import type { TaskResponseDto } from '@/services/api/schema.gen';
import { useAuthStore } from '@/stores/auth.store';
import { useSessionStore } from '@/stores/session.store';

/** Who may move a task along: tasks.update for any, tasks.update_own for one's own assigned tasks. */
export function useTaskRights() {
  const session = useSessionStore();
  const auth = useAuthStore();
  const mine = (task: TaskResponseDto) => !!task.assignedTo?.userId && task.assignedTo.userId === auth.profile?.id;
  return {
    mine,
    canChangeStatus: (task: TaskResponseDto) => session.can(P.TASKS_UPDATE) || (session.can(P.TASKS_UPDATE_OWN) && mine(task)),
  };
}

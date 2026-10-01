import { useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { clearRecentResults } from '@/features/search/recent';
import { useAuthStore } from '@/stores/auth.store';

/** Revokes the session on the server, drops cached data and returns to login. */
export function useSignOut() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    await auth.logout();
    queryClient.clear();
    clearRecentResults();
    await router.replace({ name: 'login' });
  };
}

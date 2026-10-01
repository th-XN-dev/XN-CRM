import { api } from '@/services/api/http';
import type { SessionDto } from '@/services/api/schema.gen';
import type { AuthResult, Profile, TokenPair } from '@/types/domain';

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  phone?: string;
  /** Required when the email or phone changes. */
  currentPassword?: string;
}

/** Account endpoints: never organization-scoped, never auto-refreshed. */
const account = { skipTenant: true, skipAuthRefresh: true } as const;

export const authApi = {
  login: (login: string, password: string) =>
    api.post<AuthResult>('/auth/login', { login, password }, account),
  refresh: (refreshToken: string) =>
    api.post<TokenPair>('/auth/refresh', { refreshToken }, account),
  register: (input: { name: string; email?: string; phone?: string; password: string }) =>
    api.post<AuthResult>('/auth/register', input, account),
  logout: (refreshToken: string) => api.post<null>('/auth/logout', { refreshToken }, account),
  me: () => api.get<Profile>('/auth/me', { skipTenant: true }),
  updateMe: (input: UpdateProfileInput) => api.patch<Profile>('/auth/me', input, { skipTenant: true }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<null>('/auth/change-password', { currentPassword, newPassword }, { skipTenant: true }),
  sessions: () => api.get<SessionDto[]>('/auth/sessions', { skipTenant: true }),
  revokeSession: (id: string) => api.delete<null>(`/auth/sessions/${id}`, { skipTenant: true }),
  revokeOtherSessions: () => api.post<null>('/auth/sessions/revoke-others', undefined, { skipTenant: true }),
};

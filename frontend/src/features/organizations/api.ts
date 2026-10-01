import { api } from '@/services/api/http';
import type { MemberDto } from '@/services/api/schema.gen';
import type { BranchRef, Organization, OrganizationContext } from '@/types/domain';

/** `null` clears an optional field (logo, favicon, second color). */
export interface UpdateOrganizationInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  timezone?: string;
  currency?: string;
  primaryColor?: string;
  secondaryColor?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  language?: string;
}

// URL-scoped routes: the organization comes from the path, so no tenant headers.
const urlScoped = { skipTenant: true } as const;

export const organizationsApi = {
  context: (organizationId: string) =>
    api.get<OrganizationContext>(`/organizations/${organizationId}/context`, urlScoped),
  create: (name: string) => api.post<Organization>('/organizations', { name }, urlScoped),
  update: (organizationId: string, input: UpdateOrganizationInput) =>
    api.patch<Organization>(`/organizations/${organizationId}`, input, urlScoped),
  /** Active members (name + role) for "assign to" pickers. */
  members: (organizationId: string, branchId?: string) =>
    api.get<MemberDto[]>(`/organizations/${organizationId}/members`, { ...urlScoped, params: { branchId } }),
  createBranch: (organizationId: string, input: { name: string; code: string }) =>
    api.post<BranchRef>(`/organizations/${organizationId}/branches`, input, urlScoped),
};

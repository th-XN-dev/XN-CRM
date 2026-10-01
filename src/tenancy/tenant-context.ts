/**
 * Verified organization/branch context for the current request.
 * Built by `TenantGuard` from the database — never from client input alone.
 */
export interface TenantContext {
  /** Authenticated user (actor for audit/events). */
  userId: string;
  organizationId: string;
  /** IANA timezone of the organization — used for "today" in business dates. */
  timezone: string;
  membershipId: string;
  role: { id: string; key: string };
  permissions: ReadonlySet<string>;
  /** true → member can access every branch of the organization. */
  allBranches: boolean;
  /** Explicitly assigned branches (ignored when `allBranches` is true). */
  branchIds: readonly string[];
  /** Branch selected via `X-Branch-Id`, verified; null when not sent. */
  branchId: string | null;
}

export function hasBranchAccess(
  tenant: Pick<TenantContext, 'allBranches' | 'branchIds'>,
  branchId: string,
): boolean {
  return tenant.allBranches || tenant.branchIds.includes(branchId);
}

export const ORGANIZATION_HEADER = 'x-organization-id';
export const BRANCH_HEADER = 'x-branch-id';

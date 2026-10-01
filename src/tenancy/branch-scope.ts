import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { hasBranchAccess, type TenantContext } from './tenant-context';

/** Branch ids the caller is limited to, or `null` when they can see every branch. */
export function restrictedBranchIds(tenant: TenantContext): string[] | null {
  return tenant.allBranches ? null : [...tenant.branchIds];
}

export function assertBranchAccess(tenant: TenantContext, branchId: string): void {
  if (!hasBranchAccess(tenant, branchId)) {
    throw AppException.forbidden(
      ErrorCode.BRANCH_ACCESS_DENIED,
      'You do not have access to this branch',
    );
  }
}

/**
 * Branch filter for list endpoints, in priority order:
 *   1. `?branchId=` (must be accessible → else 403),
 *   2. the selected branch (`X-Branch-Id`, already verified by TenantGuard),
 *   3. every branch the caller may access (`undefined` = no restriction).
 */
export function branchListFilter(
  tenant: TenantContext,
  requestedBranchId?: string,
): string | { in: string[] } | undefined {
  if (requestedBranchId) {
    assertBranchAccess(tenant, requestedBranchId);
    return requestedBranchId;
  }
  if (tenant.branchId) return tenant.branchId;
  const restricted = restrictedBranchIds(tenant);
  return restricted ? { in: restricted } : undefined;
}

/**
 * Base `where` for records owned by a branch (students, groups, enrollments):
 * always the current organization, plus the caller's branches when restricted.
 */
export function branchOwnedWhere(tenant: TenantContext): {
  organizationId: string;
  branchId?: { in: string[] };
} {
  const restricted = restrictedBranchIds(tenant);
  return {
    organizationId: tenant.organizationId,
    ...(restricted && { branchId: { in: restricted } }),
  };
}

/**
 * `where` for branch-owned records in lists and reports: the organization, then
 * the requested / selected branch, else every branch the caller may access.
 */
export function scopedBranchWhere(
  tenant: TenantContext,
  requestedBranchId?: string,
): { organizationId: string; branchId?: string | { in: string[] } } {
  const filter = branchListFilter(tenant, requestedBranchId);
  return filter === undefined
    ? { organizationId: tenant.organizationId }
    : { organizationId: tenant.organizationId, branchId: filter };
}

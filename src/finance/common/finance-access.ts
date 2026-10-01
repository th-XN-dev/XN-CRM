import { AppException } from '../../common/errors/app.exception';
import type { ErrorCode } from '../../common/errors/error-codes';
import { assertBranchAccess, scopedBranchWhere } from '../../tenancy/branch-scope';
import { type TenantContext } from '../../tenancy/tenant-context';

export { dateRangeFilter, dayRangeFilter } from '../../common/utils/date-range';

/**
 * Finance records are owned by a branch: every list is limited to the caller's
 * branches (and optionally one requested/selected branch).
 */
export const financeScope = scopedBranchWhere;

/** 404 when outside the organization (by the caller's `where`), 403 outside the caller's branches. */
export function assertFound<T extends { branchId: string }>(
  tenant: TenantContext,
  record: T | null,
  code: ErrorCode,
  what: string,
): T {
  if (!record) throw AppException.notFound(code, `${what} not found`);
  assertBranchAccess(tenant, record.branchId);
  return record;
}

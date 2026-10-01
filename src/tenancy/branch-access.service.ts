import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { assertBranchAccess } from './branch-scope';
import { type TenantContext } from './tenant-context';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class BranchAccessService {
  constructor(private readonly tenantContext: TenantContextService) {}

  /**
   * Picks the branch a new record is written to — explicit value, else the
   * selected branch (`X-Branch-Id`), else `fallback` — and verifies that the
   * caller may use it and that it is an active branch of the organization.
   */
  async resolveWritableBranch(
    tenant: TenantContext,
    requested?: string | null,
    fallback?: string | null,
  ): Promise<string> {
    const branchId = requested ?? tenant.branchId ?? fallback;
    if (!branchId) {
      throw AppException.badRequest(
        ErrorCode.BRANCH_CONTEXT_REQUIRED,
        'branchId is required (or select a branch with X-Branch-Id)',
      );
    }
    await this.assertWritableBranch(tenant, branchId);
    return branchId;
  }

  async assertWritableBranch(tenant: TenantContext, branchId: string): Promise<void> {
    assertBranchAccess(tenant, branchId);
    if (!(await this.tenantContext.isActiveBranchOf(branchId, tenant.organizationId))) {
      throw AppException.notFound(ErrorCode.BRANCH_NOT_FOUND, 'Branch not found or inactive');
    }
  }
}

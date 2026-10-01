import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type AppRequest } from '../../common/types/request.types';
import { centerUnavailable } from '../../platform/center-availability';
import {
  ORGANIZATION_SCOPE_KEY,
  type OrganizationScopeOptions,
} from '../decorators/organization-scoped.decorator';
import { BRANCH_HEADER, hasBranchAccess, ORGANIZATION_HEADER } from '../tenant-context';
import { TenantContextService } from '../tenant-context.service';

/**
 * Runs after authentication on `@OrganizationScoped()` routes:
 *   1. resolves the requested organization (route param and/or header),
 *   2. verifies active membership in the database and that the center is
 *      usable (not frozen, inside its activation period),
 *   3. verifies the optional/required branch belongs to the org and is accessible,
 *   4. attaches the verified `TenantContext` to the request.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<OrganizationScopeOptions | undefined>(
      ORGANIZATION_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    if (!request.user) throw AppException.unauthorized();
    if (request.user.mustChangePassword) throw passwordChangeRequired();

    const organizationId = this.resolveOrganizationId(request, options);
    const resolved = await this.tenantContext.resolve(request.user.id, organizationId);
    if (!resolved) {
      throw AppException.forbidden(
        ErrorCode.ORGANIZATION_ACCESS_DENIED,
        'You do not have access to this organization',
      );
    }
    // Reads and writes alike: a frozen or expired center is closed to its members.
    if (resolved.availability !== 'ACTIVE') throw centerUnavailable(resolved.availability);
    const { tenant } = resolved;

    const branchId = await this.resolveBranchId(request, options, organizationId);
    if (branchId && !hasBranchAccess(tenant, branchId)) {
      throw AppException.forbidden(
        ErrorCode.BRANCH_ACCESS_DENIED,
        'You do not have access to this branch',
      );
    }

    request.tenant = { ...tenant, branchId };
    return true;
  }

  private resolveOrganizationId(request: AppRequest, options: OrganizationScopeOptions): string {
    const param = options.param ? request.params[options.param] : undefined;
    const fromParam = typeof param === 'string' ? param : undefined;
    const fromHeader = readHeader(request, ORGANIZATION_HEADER);

    if (fromParam && fromHeader && fromParam !== fromHeader) {
      throw AppException.badRequest(
        ErrorCode.ORGANIZATION_CONTEXT_MISMATCH,
        'X-Organization-Id header does not match the organization in the URL',
      );
    }
    const organizationId = fromParam ?? fromHeader;
    if (!organizationId) {
      throw AppException.badRequest(
        ErrorCode.ORGANIZATION_CONTEXT_REQUIRED,
        'X-Organization-Id header is required',
      );
    }
    if (!isUUID(organizationId)) {
      throw AppException.badRequest(ErrorCode.VALIDATION_ERROR, 'Organization id must be a UUID');
    }
    return organizationId;
  }

  private async resolveBranchId(
    request: AppRequest,
    options: OrganizationScopeOptions,
    organizationId: string,
  ): Promise<string | null> {
    const branchId = readHeader(request, BRANCH_HEADER);
    if (!branchId) {
      if (options.branch === 'required') {
        throw AppException.badRequest(
          ErrorCode.BRANCH_CONTEXT_REQUIRED,
          'X-Branch-Id header is required',
        );
      }
      return null;
    }
    if (!isUUID(branchId)) {
      throw AppException.badRequest(ErrorCode.VALIDATION_ERROR, 'Branch id must be a UUID');
    }
    // Same response for "doesn't exist" and "belongs to another organization".
    if (!(await this.tenantContext.isActiveBranchOf(branchId, organizationId))) {
      throw AppException.forbidden(
        ErrorCode.BRANCH_ACCESS_DENIED,
        'You do not have access to this branch',
      );
    }
    return branchId;
  }
}

export const passwordChangeRequired = (): AppException =>
  AppException.forbidden(
    ErrorCode.PASSWORD_CHANGE_REQUIRED,
    'Change the temporary password before continuing',
  );

function readHeader(request: AppRequest, name: string): string | undefined {
  const value = request.headers[name];
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || undefined;
}

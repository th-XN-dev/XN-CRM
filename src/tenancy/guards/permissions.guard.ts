import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type AppRequest } from '../../common/types/request.types';
import { type PermissionKey } from '../../permissions/permissions.catalog';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

/** Checks `@RequirePermissions()` against the verified tenant context. Runs after `TenantGuard`. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const all = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    const any = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      ANY_PERMISSIONS_KEY,
      targets,
    );
    if (!all?.length && !any?.length) return true;

    const { tenant } = context.switchToHttp().getRequest<AppRequest>();
    if (!tenant) {
      // Misconfigured route: permissions only make sense inside an organization.
      throw new Error(
        `@RequirePermissions() on ${context.getClass().name}.${context.getHandler().name} requires @OrganizationScoped()`,
      );
    }

    const missing = (all ?? []).filter((permission) => !tenant.permissions.has(permission));
    if (missing.length > 0) {
      throw AppException.forbidden(
        ErrorCode.PERMISSION_DENIED,
        `Missing permission: ${missing.join(', ')}`,
      );
    }
    if (any?.length && !any.some((permission) => tenant.permissions.has(permission))) {
      throw AppException.forbidden(
        ErrorCode.PERMISSION_DENIED,
        `Missing permission: one of ${any.join(', ')}`,
      );
    }
    return true;
  }
}

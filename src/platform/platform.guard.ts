import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { type AppRequest } from '../common/types/request.types';
import { passwordChangeRequired } from '../tenancy/guards/tenant.guard';
import { type PlatformPermission, PLATFORM_ROLE_PERMISSIONS } from './platform-permissions';
import { PLATFORM_SCOPE_KEY } from './platform-scoped.decorator';

/**
 * Runs after authentication on `@PlatformScoped()` routes. The platform role
 * comes from the database on every request (JwtStrategy), not from the token.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PlatformPermission[] | undefined>(
      PLATFORM_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest<AppRequest>();
    if (!user) throw AppException.unauthorized();
    const granted = user.platformRole ? PLATFORM_ROLE_PERMISSIONS[user.platformRole] : [];
    if (granted.length === 0 || !required.every((p) => granted.includes(p))) {
      throw AppException.forbidden(
        ErrorCode.PLATFORM_ACCESS_DENIED,
        'This area is reserved for the platform owner',
      );
    }
    if (user.mustChangePassword) throw passwordChangeRequired();
    return true;
  }
}

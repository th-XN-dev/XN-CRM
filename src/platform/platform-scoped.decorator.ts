import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse } from '@nestjs/swagger';
import { type PlatformPermission } from './platform-permissions';

export const PLATFORM_SCOPE_KEY = 'platformScope';

/**
 * Marks a route as platform-level (owner area). `PlatformGuard` then requires
 * a platform role that grants every listed permission. Never combine with
 * `@OrganizationScoped()` — the owner acts on centers by id, not as a member.
 */
export function PlatformScoped(
  ...permissions: PlatformPermission[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(PLATFORM_SCOPE_KEY, permissions),
    ApiBearerAuth(),
    ApiForbiddenResponse({ description: 'PLATFORM_ACCESS_DENIED' }),
  );
}

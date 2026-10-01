import { SetMetadata } from '@nestjs/common';
import { type PermissionKey } from '../../permissions/permissions.catalog';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const ANY_PERMISSIONS_KEY = 'requiredAnyPermissions';

/** All listed permissions are required. Must be combined with `@OrganizationScoped()`. */
export const RequirePermissions = (
  ...permissions: PermissionKey[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * At least one of the listed permissions is required — typically a full
 * permission and its `*_own` variant. The service then narrows the data
 * (see TeacherScopeService). Must be combined with `@OrganizationScoped()`.
 */
export const RequireAnyPermission = (
  ...permissions: PermissionKey[]
): MethodDecorator & ClassDecorator => SetMetadata(ANY_PERMISSIONS_KEY, permissions);

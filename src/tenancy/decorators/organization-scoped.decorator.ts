import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse, ApiHeader } from '@nestjs/swagger';

export const ORGANIZATION_SCOPE_KEY = 'organizationScope';

export interface OrganizationScopeOptions {
  /**
   * Route param holding the organization id (e.g. `organizationId`).
   * When omitted, the `X-Organization-Id` header is required.
   * When both are present they must match.
   */
  param?: string;
  /** Whether `X-Branch-Id` must be sent. Defaults to optional (validated if sent). */
  branch?: 'optional' | 'required';
}

/**
 * Marks a route as tenant-scoped. `TenantGuard` then verifies membership in the
 * organization (and branch, if given) against the database and exposes the
 * result via `@CurrentTenant()`.
 */
export function OrganizationScoped(
  options: OrganizationScopeOptions = {},
): MethodDecorator & ClassDecorator {
  const decorators = [
    SetMetadata(ORGANIZATION_SCOPE_KEY, options),
    ApiHeader({
      name: 'X-Branch-Id',
      required: options.branch === 'required',
      description: 'Current branch context (verified server-side).',
    }),
    ApiForbiddenResponse({
      description: 'No access to organization/branch, or missing permission.',
    }),
  ];
  if (!options.param) {
    decorators.push(
      ApiHeader({
        name: 'X-Organization-Id',
        required: true,
        description: 'Current organization context (verified server-side).',
      }),
    );
  }
  return applyDecorators(...decorators);
}

import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/errors/app.exception';
import { type TenantContext } from '../tenant-context';
import { PermissionsGuard } from './permissions.guard';

function contextWith(tenant: Partial<TenantContext> | undefined): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ tenant }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  it('allows routes without required permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextWith(undefined))).toBe(true);
  });

  it('allows when every required permission is granted', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['branch.read', 'branch.create']);
    const tenant = { permissions: new Set(['branch.read', 'branch.create', 'branch.update']) };
    expect(guard.canActivate(contextWith(tenant))).toBe(true);
  });

  it('throws PERMISSION_DENIED when any permission is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['branch.read', 'branch.create']);
    const tenant = { permissions: new Set(['branch.read']) };
    expect(() => guard.canActivate(contextWith(tenant))).toThrow(AppException);
  });

  it('any-of: passes with one of the listed permissions', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key) =>
        key === 'requiredAnyPermissions' ? ['groups.read', 'groups.read_own'] : undefined,
      );
    expect(guard.canActivate(contextWith({ permissions: new Set(['groups.read_own']) }))).toBe(
      true,
    );
    expect(() => guard.canActivate(contextWith({ permissions: new Set(['branch.read']) }))).toThrow(
      AppException,
    );
  });

  it('fails loudly on a route missing @OrganizationScoped()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['branch.read']);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(/requires @OrganizationScoped/);
  });
});

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type AppRequest } from '../../common/types/request.types';
import { type TenantContext } from '../tenant-context';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const tenant = ctx.switchToHttp().getRequest<AppRequest>().tenant;
    if (!tenant) {
      throw new Error('@CurrentTenant() used on a route without @OrganizationScoped()');
    }
    return tenant;
  },
);

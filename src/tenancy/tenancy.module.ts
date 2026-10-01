import { Global, Module } from '@nestjs/common';
import { BranchAccessService } from './branch-access.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { TenantGuard } from './guards/tenant.guard';
import { TenantContextService } from './tenant-context.service';

@Global()
@Module({
  providers: [TenantContextService, BranchAccessService, TenantGuard, PermissionsGuard],
  exports: [TenantContextService, BranchAccessService, TenantGuard, PermissionsGuard],
})
export class TenancyModule {}

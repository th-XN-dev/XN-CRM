import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@ApiTags('Branches')
@ApiBearerAuth()
@Controller()
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Post('organizations/:organizationId/branches')
  @OrganizationScoped({ param: 'organizationId' })
  @RequirePermissions(PERMISSIONS.BRANCH_CREATE)
  @ApiOperation({ summary: 'Create a branch in the organization' })
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateBranchDto) {
    return this.branches.create(tenant, dto);
  }

  @Get('organizations/:organizationId/branches')
  @OrganizationScoped({ param: 'organizationId' })
  @RequirePermissions(PERMISSIONS.BRANCH_READ)
  @ApiOperation({ summary: 'Branch selector: branches the caller can access' })
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListBranchesQueryDto) {
    return this.branches.list(tenant, query);
  }

  @Get('branches/:id')
  @OrganizationScoped()
  @RequirePermissions(PERMISSIONS.BRANCH_READ)
  @ApiOperation({ summary: 'Get a branch of the current organization (X-Organization-Id)' })
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.branches.findOne(tenant, id);
  }

  @Patch('branches/:id')
  @OrganizationScoped()
  @RequirePermissions(PERMISSIONS.BRANCH_UPDATE)
  @ApiOperation({ summary: 'Update a branch of the current organization (X-Organization-Id)' })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branches.update(tenant, id, dto);
  }
}

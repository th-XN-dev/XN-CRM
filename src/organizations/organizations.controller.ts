import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { type EnvironmentVariables } from '../config/env.validation';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { type AuthUser } from '../common/types/request.types';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  ApiEnvelopeArrayResponse,
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../common/swagger/api-responses';
import {
  AssignableRoleDto,
  CreateStaffDto,
  ListStaffQueryDto,
  StaffCredentialsDto,
  StaffMemberDto,
  UpdateStaffDto,
} from './dto/staff.dto';
import { StaffService } from './staff.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { ListMembersQueryDto, MemberDto } from './dto/member.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly staff: StaffService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Self-service: create a center; the caller becomes its DIRECTOR (CENTER_CREATION=open)',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrganizationDto) {
    if (this.config.get('CENTER_CREATION', { infer: true }) !== 'open' && !user.platformRole) {
      throw AppException.forbidden(
        ErrorCode.PLATFORM_ACCESS_DENIED,
        'Centers are created by the platform owner',
      );
    }
    return this.organizations.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Organization selector: organizations the caller belongs to' })
  list(@CurrentUser() user: AuthUser) {
    return this.organizations.listForUser(user.id);
  }

  @Get(':id/context')
  @OrganizationScoped({ param: 'id' })
  @ApiOperation({
    summary: 'Session context: branding, my role & permissions, branches I can work in',
  })
  context(@CurrentTenant() tenant: TenantContext) {
    return this.organizations.context(tenant);
  }

  @Get(':id/members')
  @OrganizationScoped({ param: 'id' })
  @RequireAnyPermission(PERMISSIONS.USERS_READ, PERMISSIONS.LEADS_ASSIGN)
  @ApiOperation({ summary: 'Active members (name and role), e.g. for assignee pickers' })
  @ApiEnvelopeArrayResponse(MemberDto)
  members(@CurrentTenant() tenant: TenantContext, @Query() query: ListMembersQueryDto) {
    return this.organizations.members(tenant, query);
  }

  @Get(':id')
  @OrganizationScoped({ param: 'id' })
  @RequirePermissions(PERMISSIONS.ORGANIZATION_READ)
  @ApiOperation({ summary: "Organization profile with the caller's role and permissions" })
  findOne(@CurrentTenant() tenant: TenantContext) {
    return this.organizations.findOne(tenant);
  }

  @Patch(':id')
  @OrganizationScoped({ param: 'id' })
  @RequirePermissions(PERMISSIONS.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Update organization profile' })
  update(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateOrganizationDto) {
    return this.organizations.update(tenant, dto);
  }

  // ─── Staff (the director's `staff.*`) ────────────────────────────────────

  @Get(':id/roles')
  @OrganizationScoped({ param: 'id' })
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: 'Staff roles and their permissions; `assignable` for the caller' })
  @ApiEnvelopeArrayResponse(AssignableRoleDto)
  roles(@CurrentTenant() tenant: TenantContext) {
    return this.staff.roles(tenant);
  }

  @Get(':id/staff')
  @OrganizationScoped({ param: 'id' })
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: 'Center members with role, branches and account state' })
  @ApiPaginatedResponse(StaffMemberDto)
  listStaff(@CurrentTenant() tenant: TenantContext, @Query() query: ListStaffQueryDto) {
    return this.staff.list(tenant, query);
  }

  @Post(':id/staff')
  @OrganizationScoped({ param: 'id' })
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  @ApiOperation({ summary: 'Add a staff member (temporary password returned once)' })
  @ApiEnvelopeResponse(StaffCredentialsDto, HttpStatus.CREATED)
  createStaff(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateStaffDto) {
    return this.staff.create(tenant, dto);
  }

  @Patch(':id/staff/:membershipId')
  @OrganizationScoped({ param: 'id' })
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @ApiOperation({ summary: 'Change role, branches or suspend a staff member' })
  @ApiEnvelopeResponse(StaffMemberDto)
  updateStaff(
    @CurrentTenant() tenant: TenantContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(tenant, membershipId, dto);
  }

  @Post(':id/staff/:membershipId/reset-password')
  @OrganizationScoped({ param: 'id' })
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @ApiOperation({ summary: 'New temporary password for a center-only account (returned once)' })
  @ApiEnvelopeResponse(StaffCredentialsDto, HttpStatus.CREATED)
  resetStaffPassword(
    @CurrentTenant() tenant: TenantContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.staff.resetPassword(tenant, membershipId);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
} from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { CreateGroupDto, ListGroupsQueryDto, UpdateGroupDto } from './dto/group.dto';
import { GroupResponseDto } from './dto/group-response.dto';
import { GroupsService } from './groups.service';

@ApiTags('Groups')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.GROUPS_CREATE)
  @ApiOperation({ summary: 'Create a group in a branch (branch defaults to X-Branch-Id)' })
  @ApiEnvelopeResponse(GroupResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'LEVEL_COURSE_MISMATCH | INVALID_DATE_RANGE')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateGroupDto) {
    return this.groups.create(tenant, dto);
  }

  @Get()
  @RequireAnyPermission(PERMISSIONS.GROUPS_READ, PERMISSIONS.GROUPS_READ_OWN)
  @ApiOperation({
    summary: 'List groups (teachers with groups.read_own see only their own groups)',
  })
  @ApiPaginatedResponse(GroupResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListGroupsQueryDto) {
    return this.groups.list(tenant, query);
  }

  @Get(':id')
  @RequireAnyPermission(PERMISSIONS.GROUPS_READ, PERMISSIONS.GROUPS_READ_OWN)
  @ApiOperation({ summary: 'Get a group' })
  @ApiEnvelopeResponse(GroupResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'GROUP_NOT_FOUND')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'GROUP_ACCESS_DENIED (not your group)')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.GROUPS_UPDATE)
  @ApiOperation({
    summary: 'Update a group, incl. teacher/room assignment (branch and course are immutable)',
  })
  @ApiEnvelopeResponse(GroupResponseDto)
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'GROUP_CAPACITY_BELOW_ENROLLED | GROUP_HAS_ACTIVE_ENROLLMENTS | TEACHER_SCHEDULE_CONFLICT',
  )
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.GROUPS_DELETE)
  @ApiOperation({ summary: 'Cancel a group (soft delete)' })
  @ApiEnvelopeResponse(GroupResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'GROUP_HAS_ACTIVE_ENROLLMENTS')
  cancel(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.cancel(tenant, id);
  }
}

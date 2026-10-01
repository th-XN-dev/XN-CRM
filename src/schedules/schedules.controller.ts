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
  ApiEnvelopeArrayResponse,
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
import {
  CreateScheduleDto,
  ListSchedulesQueryDto,
  TimetableQueryDto,
  UpdateScheduleDto,
} from './dto/schedule.dto';
import { ScheduleResponseDto, TimetableSlotDto } from './dto/schedule-response.dto';
import { SchedulesService } from './schedules.service';

const CONFLICTS = 'ROOM_SCHEDULE_CONFLICT | TEACHER_SCHEDULE_CONFLICT | GROUP_SCHEDULE_CONFLICT';

@ApiTags('Schedules')
@ApiBearerAuth()
@OrganizationScoped()
@Controller()
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Post('groups/:groupId/schedules')
  @RequirePermissions(PERMISSIONS.SCHEDULES_MANAGE)
  @ApiOperation({ summary: 'Add a weekly lesson slot to a group (checks room/teacher conflicts)' })
  @ApiEnvelopeResponse(ScheduleResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, CONFLICTS)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'INVALID_TIME_RANGE | ROOM_BRANCH_MISMATCH')
  create(
    @CurrentTenant() tenant: TenantContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.schedules.create(tenant, groupId, dto);
  }

  @Get('groups/:groupId/schedules')
  @RequireAnyPermission(PERMISSIONS.GROUPS_READ, PERMISSIONS.GROUPS_READ_OWN)
  @ApiOperation({ summary: 'Weekly schedule of a group (Monday → Sunday)' })
  @ApiPaginatedResponse(ScheduleResponseDto)
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: ListSchedulesQueryDto,
  ) {
    return this.schedules.list(tenant, groupId, query);
  }

  @Get('schedules')
  @RequireAnyPermission(PERMISSIONS.GROUPS_READ, PERMISSIONS.GROUPS_READ_OWN)
  @ApiOperation({
    summary: 'Weekly timetable across groups (filter by branch, group, teacher or room)',
  })
  @ApiEnvelopeArrayResponse(TimetableSlotDto)
  timetable(@CurrentTenant() tenant: TenantContext, @Query() query: TimetableQueryDto) {
    return this.schedules.timetable(tenant, query);
  }

  @Patch('schedules/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULES_MANAGE)
  @ApiOperation({ summary: 'Change a lesson slot (re-checks conflicts)' })
  @ApiEnvelopeResponse(ScheduleResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, CONFLICTS)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedules.update(tenant, id, dto);
  }

  @Delete('schedules/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULES_MANAGE)
  @ApiOperation({ summary: 'Deactivate a lesson slot (soft delete)' })
  @ApiEnvelopeResponse(ScheduleResponseDto)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedules.remove(tenant, id);
  }
}

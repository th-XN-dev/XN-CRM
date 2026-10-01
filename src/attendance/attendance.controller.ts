import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { AttendanceService } from './attendance.service';
import {
  DateRangeQueryDto,
  GroupAttendanceQueryDto,
  MarkGroupAttendanceDto,
  StudentAttendanceQueryDto,
  UpdateAttendanceDto,
} from './dto/attendance.dto';
import {
  AttendanceResponseDto,
  GroupAttendanceDto,
  GroupAttendanceStatsDto,
  MarkAttendanceResultDto,
  StudentAttendanceItemDto,
  StudentAttendanceStatsDto,
} from './dto/attendance-response.dto';

const READ = [PERMISSIONS.ATTENDANCE_READ, PERMISSIONS.ATTENDANCE_READ_OWN] as const;
const MARK = [PERMISSIONS.ATTENDANCE_MARK, PERMISSIONS.ATTENDANCE_MARK_OWN] as const;

@ApiTags('Attendance')
@ApiBearerAuth()
@OrganizationScoped()
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('attendance/group/:groupId')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission(...MARK)
  @ApiOperation({
    summary: 'Mark a group for one date (create or update per enrollment, in one transaction)',
  })
  @ApiEnvelopeResponse(MarkAttendanceResultDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'ENROLLMENT_NOT_IN_GROUP | ATTENDANCE_DATE_OUT_OF_RANGE',
  )
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'GROUP_ACCESS_DENIED | ATTENDANCE_FUTURE_DATE')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'ENROLLMENT_NOT_ACTIVE')
  mark(
    @CurrentTenant() tenant: TenantContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: MarkGroupAttendanceDto,
  ) {
    return this.attendance.mark(tenant, groupId, dto);
  }

  @Get('groups/:groupId/attendance')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Attendance sheet of a group for a date (default: today)' })
  @ApiEnvelopeResponse(GroupAttendanceDto)
  groupRoster(
    @CurrentTenant() tenant: TenantContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: GroupAttendanceQueryDto,
  ) {
    return this.attendance.groupRoster(tenant, groupId, query);
  }

  @Get('groups/:groupId/attendance/statistics')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Group attendance statistics (optional from/to)' })
  @ApiEnvelopeResponse(GroupAttendanceStatsDto)
  groupStatistics(
    @CurrentTenant() tenant: TenantContext,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.attendance.groupStatistics(tenant, groupId, query);
  }

  @Get('students/:studentId/attendance')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Attendance history of a student (filters: from, to, status)' })
  @ApiPaginatedResponse(StudentAttendanceItemDto)
  studentHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: StudentAttendanceQueryDto,
  ) {
    return this.attendance.studentHistory(tenant, studentId, query);
  }

  @Get('students/:studentId/attendance/statistics')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Student attendance statistics: (PRESENT + LATE) / total × 100' })
  @ApiEnvelopeResponse(StudentAttendanceStatsDto)
  studentStatistics(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.attendance.studentStatistics(tenant, studentId, query);
  }

  @Patch('attendance/:id')
  @RequireAnyPermission(...MARK)
  @ApiOperation({ summary: 'Correct one mark' })
  @ApiEnvelopeResponse(AttendanceResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'ATTENDANCE_NOT_FOUND')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.attendance.update(tenant, id, dto);
  }

  @Delete('attendance/:id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_DELETE)
  @ApiOperation({ summary: 'Delete one mark' })
  @ApiEnvelopeResponse(AttendanceResponseDto)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.remove(tenant, id);
  }
}

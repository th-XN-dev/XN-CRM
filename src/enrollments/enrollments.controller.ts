import {
  Body,
  Controller,
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
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  CancelEnrollmentDto,
  CreateEnrollmentDto,
  ListEnrollmentsQueryDto,
  TransferEnrollmentDto,
  UpdateEnrollmentDto,
} from './dto/enrollment.dto';
import { EnrollmentResponseDto, TransferResultDto } from './dto/enrollment-response.dto';
import { EnrollmentsService } from './enrollments.service';

@ApiTags('Enrollments')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.ENROLLMENTS_CREATE)
  @ApiOperation({ summary: 'Enroll a student into a group' })
  @ApiEnvelopeResponse(EnrollmentResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'GROUP_CAPACITY_FULL | STUDENT_ALREADY_ENROLLED | STUDENT_NOT_ACTIVE | GROUP_NOT_ACTIVE',
  )
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateEnrollmentDto) {
    return this.enrollments.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ENROLLMENTS_READ)
  @ApiOperation({
    summary: 'List enrollments (filters: status, studentId, groupId, branchId, courseId, levelId)',
  })
  @ApiPaginatedResponse(EnrollmentResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListEnrollmentsQueryDto) {
    return this.enrollments.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ENROLLMENTS_READ)
  @ApiOperation({ summary: 'Get an enrollment' })
  @ApiEnvelopeResponse(EnrollmentResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'ENROLLMENT_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.enrollments.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ENROLLMENTS_UPDATE)
  @ApiOperation({ summary: 'Edit enrollment notes' })
  @ApiEnvelopeResponse(EnrollmentResponseDto)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEnrollmentDto,
  ) {
    return this.enrollments.update(tenant, id, dto);
  }

  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ENROLLMENTS_TRANSFER)
  @ApiOperation({ summary: 'Transfer to another group (closes this enrollment, opens a new one)' })
  @ApiEnvelopeResponse(TransferResultDto)
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'ENROLLMENT_NOT_ACTIVE | GROUP_CAPACITY_FULL | GROUP_NOT_ACTIVE',
  )
  transfer(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferEnrollmentDto,
  ) {
    return this.enrollments.transfer(tenant, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ENROLLMENTS_CANCEL)
  @ApiOperation({ summary: 'Cancel an active enrollment (kept in history)' })
  @ApiEnvelopeResponse(EnrollmentResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'ENROLLMENT_NOT_ACTIVE')
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelEnrollmentDto,
  ) {
    return this.enrollments.cancel(tenant, id, dto);
  }
}

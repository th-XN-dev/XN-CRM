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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CenterAnalyticsDto, OwnerAnalyticsDto } from '../analytics/dto/metrics.dto';
import { AuditLogResponseDto } from '../audit/dto/audit-log.dto';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import {
  ApiEnvelopeResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
} from '../common/swagger/api-responses';
import { type AuthUser } from '../common/types/request.types';
import { ReportQueryDto } from '../reports/common/report-query.dto';
import { CenterAnalyticsService } from '../analytics/center-analytics.service';
import { OwnerAnalyticsService } from './analytics/owner-analytics.service';
import { CenterBulkService, confirmationMismatch } from './centers/center-bulk.service';
import { CenterPurgeService } from './centers/center-purge.service';
import { OwnerCentersService } from './centers/owner-centers.service';
import {
  ActivateCenterDto,
  BulkCentersDto,
  BulkCentersResultDto,
  CenterDto,
  CreateCenterDto,
  CreatedCenterDto,
  DeleteCenterDto,
  FreezeCenterDto,
  ListCentersQueryDto,
  PurgeResultDto,
  UpdateCenterDto,
} from './dto/center.dto';
import {
  CreateDirectorDto,
  DirectorCredentialsDto,
  DirectorDto,
  ListDirectorsQueryDto,
  UpdateDirectorDto,
} from './dto/director.dto';
import { DirectorsService } from './directors/directors.service';
import { PLATFORM_PERMISSIONS as PP } from './platform-permissions';
import { PlatformScoped } from './platform-scoped.decorator';

class OwnerAnalyticsQueryDto extends ReportQueryDto {}

class ManagementAuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  centerId?: string;
}

/**
 * The platform owner's API (`/owner/*`). Centers are addressed by id; the
 * owner is not a member of them, so no tenant context and no center staff
 * permissions are involved — only the platform role.
 */
@ApiTags('Owner')
@Controller('owner')
export class OwnerController {
  constructor(
    private readonly centers: OwnerCentersService,
    private readonly purge: CenterPurgeService,
    private readonly bulk: CenterBulkService,
    private readonly directors: DirectorsService,
    private readonly analytics: OwnerAnalyticsService,
    private readonly centerAnalytics: CenterAnalyticsService,
    private readonly audit: AuditService,
  ) {}

  // ─── Analytics ─────────────────────────────────────────────────────────

  @Get('analytics')
  @PlatformScoped(PP.ANALYTICS_GLOBAL_READ)
  @ApiOperation({ summary: 'Owner dashboard: center counts, platform totals, one row per center' })
  @ApiEnvelopeResponse(OwnerAnalyticsDto)
  overview(@Query() query: OwnerAnalyticsQueryDto) {
    return this.analytics.overview(query);
  }

  @Get('centers/:id/analytics')
  @PlatformScoped(PP.ANALYTICS_GLOBAL_READ)
  @ApiOperation({ summary: 'One center by sub-center and branch (same numbers its director sees)' })
  @ApiEnvelopeResponse(CenterAnalyticsDto)
  centerDeepAnalytics(@Param('id', ParseUUIDPipe) id: string, @Query() query: ReportQueryDto) {
    return this.centerAnalytics.forCenter(id, null, query);
  }

  // ─── Centers ───────────────────────────────────────────────────────────

  @Get('centers')
  @PlatformScoped(PP.CENTERS_READ)
  @ApiOperation({ summary: 'All centers with status, activation period and counts' })
  @ApiPaginatedResponse(CenterDto)
  listCenters(@Query() query: ListCentersQueryDto) {
    return this.centers.list(query);
  }

  @Post('centers')
  @PlatformScoped(PP.CENTERS_CREATE)
  @ApiOperation({
    summary: 'Create a center (profile, brand, activation period) and optionally its director',
  })
  @ApiEnvelopeResponse(CreatedCenterDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'ORGANIZATION_SLUG_TAKEN | MEMBER_ALREADY_EXISTS')
  createCenter(@CurrentUser() user: AuthUser, @Body() dto: CreateCenterDto) {
    return this.centers.create(user, dto);
  }

  @Get('centers/:id')
  @PlatformScoped(PP.CENTERS_READ)
  @ApiEnvelopeResponse(CenterDto)
  findCenter(@Param('id', ParseUUIDPipe) id: string) {
    return this.centers.findOne(id);
  }

  @Patch('centers/:id')
  @PlatformScoped(PP.CENTERS_UPDATE)
  @ApiOperation({ summary: 'Edit profile, brand, slug and activation period' })
  @ApiEnvelopeResponse(CenterDto)
  updateCenter(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCenterDto,
  ) {
    return this.centers.update(user, id, dto);
  }

  @Post('centers/:id/freeze')
  @PlatformScoped(PP.CENTERS_LIFECYCLE)
  @ApiOperation({ summary: 'ACTIVE → FROZEN: members are locked out, data is kept' })
  @ApiEnvelopeResponse(CenterDto, HttpStatus.CREATED)
  freeze(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FreezeCenterDto,
  ) {
    return this.centers.freeze(user, id, dto);
  }

  @Post('centers/:id/activate')
  @PlatformScoped(PP.CENTERS_LIFECYCLE)
  @ApiOperation({ summary: 'FROZEN/ARCHIVED → ACTIVE (extend activeUntil if it has passed)' })
  @ApiEnvelopeResponse(CenterDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'CENTER_PERIOD_ENDED')
  activate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivateCenterDto,
  ) {
    return this.centers.activate(user, id, dto);
  }

  @Post('centers/:id/archive')
  @PlatformScoped(PP.CENTERS_LIFECYCLE)
  @ApiOperation({ summary: '→ ARCHIVED: hidden from members; history and finances are kept' })
  @ApiEnvelopeResponse(CenterDto, HttpStatus.CREATED)
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.centers.archive(user, id);
  }

  @Delete('centers/:id')
  @PlatformScoped(PP.CENTERS_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Permanently delete an ARCHIVED center and all its data (body.confirm = its slug)',
  })
  @ApiEnvelopeResponse(PurgeResultDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'CENTER_NOT_ARCHIVED')
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'CONFIRMATION_MISMATCH')
  async deleteCenter(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteCenterDto,
  ) {
    const center = await this.centers.findOne(id);
    if (dto.confirm.trim().toLowerCase() !== center.slug) {
      throw confirmationMismatch("Type the center's slug to confirm the deletion");
    }
    return this.purge.purge(user, id);
  }

  @Post('centers/bulk')
  @PlatformScoped(PP.CENTERS_LIFECYCLE, PP.CENTERS_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Archive or permanently delete up to 100 centers (delete: archived only, confirm = their count)',
  })
  @ApiEnvelopeResponse(BulkCentersResultDto)
  bulkCenters(@CurrentUser() user: AuthUser, @Body() dto: BulkCentersDto) {
    return this.bulk.run(user, dto);
  }

  // ─── Directors ─────────────────────────────────────────────────────────

  @Get('directors')
  @PlatformScoped(PP.DIRECTORS_READ)
  @ApiPaginatedResponse(DirectorDto)
  listDirectors(@Query() query: ListDirectorsQueryDto) {
    return this.directors.list(query);
  }

  @Post('directors')
  @PlatformScoped(PP.DIRECTORS_MANAGE)
  @ApiOperation({ summary: 'Add a director to a center (temporary password returned once)' })
  @ApiEnvelopeResponse(DirectorCredentialsDto, HttpStatus.CREATED)
  createDirector(@CurrentUser() user: AuthUser, @Body() dto: CreateDirectorDto) {
    return this.directors.create(user, dto);
  }

  @Get('directors/:id')
  @PlatformScoped(PP.DIRECTORS_READ)
  @ApiEnvelopeResponse(DirectorDto)
  findDirector(@Param('id', ParseUUIDPipe) id: string) {
    return this.directors.findOne(id);
  }

  @Patch('directors/:id')
  @PlatformScoped(PP.DIRECTORS_MANAGE)
  @ApiOperation({
    summary: "Rename, suspend/activate, or change the center's director permissions",
  })
  @ApiEnvelopeResponse(DirectorDto)
  updateDirector(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDirectorDto,
  ) {
    return this.directors.update(user, id, dto);
  }

  @Post('directors/:id/reset-password')
  @PlatformScoped(PP.DIRECTORS_MANAGE)
  @ApiOperation({ summary: 'New temporary password (returned once); signs the director out' })
  @ApiEnvelopeResponse(DirectorCredentialsDto, HttpStatus.CREATED)
  resetDirectorPassword(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.directors.resetPassword(user, id);
  }

  // ─── Audit ─────────────────────────────────────────────────────────────

  @Get('audit')
  @PlatformScoped(PP.PLATFORM_READ)
  @ApiOperation({ summary: 'Management trail: centers, directors, sub-centers, branches, brand' })
  @ApiPaginatedResponse(AuditLogResponseDto)
  managementAudit(@Query() query: ManagementAuditQueryDto) {
    return this.audit.listManagement(query);
  }
}

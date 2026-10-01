import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeArrayResponse, ApiEnvelopeResponse } from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { CommunicationsService } from './communications.service';
import {
  OccasionsQueryDto,
  SendAnnouncementDto,
  SendCongratulationDto,
  SendResultDto,
  SentCommunicationDto,
  SentQueryDto,
  UpcomingOccasionDto,
} from './dto/communication.dto';

/** Received ones are in the inbox: `GET /notifications?type=ANNOUNCEMENT|CONGRATULATION`. */
@ApiTags('Communications')
@ApiBearerAuth()
@OrganizationScoped()
@Controller()
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Post('announcements')
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_SEND)
  @ApiOperation({ summary: 'Send an announcement to all staff (or a branch) or to chosen people' })
  @ApiEnvelopeResponse(SendResultDto, HttpStatus.CREATED)
  announce(@CurrentTenant() tenant: TenantContext, @Body() dto: SendAnnouncementDto) {
    return this.communications.announce(tenant, dto);
  }

  @Get('announcements/sent')
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_SEND)
  @ApiOperation({ summary: 'Sent announcements with how many people have read them' })
  @ApiEnvelopeArrayResponse(SentCommunicationDto)
  sentAnnouncements(@CurrentTenant() tenant: TenantContext, @Query() query: SentQueryDto) {
    return this.communications.sent(tenant, 'ANNOUNCEMENT', query.limit);
  }

  @Post('congratulations')
  @RequirePermissions(PERMISSIONS.CONGRATULATIONS_SEND)
  @ApiOperation({ summary: 'Congratulate employees (birthday, anniversary, achievement, thanks)' })
  @ApiEnvelopeResponse(SendResultDto, HttpStatus.CREATED)
  congratulate(@CurrentTenant() tenant: TenantContext, @Body() dto: SendCongratulationDto) {
    return this.communications.congratulate(tenant, dto);
  }

  @Get('congratulations/sent')
  @RequirePermissions(PERMISSIONS.CONGRATULATIONS_SEND)
  @ApiEnvelopeArrayResponse(SentCommunicationDto)
  sentCongratulations(@CurrentTenant() tenant: TenantContext, @Query() query: SentQueryDto) {
    return this.communications.sent(tenant, 'CONGRATULATION', query.limit);
  }

  @Get('congratulations/occasions')
  @RequirePermissions(PERMISSIONS.CONGRATULATIONS_SEND)
  @ApiOperation({ summary: 'Upcoming birthdays and work anniversaries of employees' })
  @ApiEnvelopeArrayResponse(UpcomingOccasionDto)
  occasions(@CurrentTenant() tenant: TenantContext, @Query() query: OccasionsQueryDto) {
    return this.communications.occasions(tenant, query.days);
  }
}

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
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { ChangeLeadStatusDto } from './dto/change-lead-status.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateLeadActivityDto, ListActivitiesQueryDto } from './dto/create-lead-activity.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ListFollowUpsQueryDto } from './dto/list-follow-ups-query.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { LeadStatsQueryDto, LeadStatsResponseDto } from './dto/lead-stats-query.dto';
import {
  LeadActivityResponseDto,
  LeadConversionResultDto,
  LeadDetailDto,
  LeadListItemDto,
  LeadResponseDto,
} from './dto/lead-response.dto';
import { SetFollowUpDto } from './dto/set-follow-up.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadStatsService } from './lead-stats.service';
import { LeadsService } from './leads.service';

@ApiTags('Leads')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly stats: LeadStatsService,
  ) {}

  @Post()
  @RequirePermissions(PERMISSIONS.LEADS_CREATE)
  @ApiOperation({ summary: 'Create a lead (rejects a duplicate active phone)' })
  @ApiEnvelopeResponse(LeadResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'DUPLICATE_LEAD')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateLeadDto) {
    return this.leads.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'Search and filter leads' })
  @ApiPaginatedResponse(LeadListItemDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListLeadsQueryDto) {
    return this.leads.list(tenant, query);
  }

  @Get('follow-ups')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'Leads with a follow-up due (today / overdue / upcoming)' })
  @ApiPaginatedResponse(LeadListItemDto)
  followUps(@CurrentTenant() tenant: TenantContext, @Query() query: ListFollowUpsQueryDto) {
    return this.leads.listFollowUps(tenant, query);
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.LEADS_REPORT_READ)
  @ApiOperation({ summary: 'CRM funnel statistics (counts, conversion & trial rates, by source)' })
  @ApiEnvelopeResponse(LeadStatsResponseDto)
  getStats(@CurrentTenant() tenant: TenantContext, @Query() query: LeadStatsQueryDto) {
    return this.stats.stats(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'Lead with its recent activity' })
  @ApiEnvelopeResponse(LeadDetailDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'LEAD_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leads.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LEADS_UPDATE)
  @ApiOperation({ summary: 'Update lead fields' })
  @ApiEnvelopeResponse(LeadResponseDto)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.LEADS_DELETE)
  @ApiOperation({ summary: 'Soft-delete a lead (history is kept)' })
  @ApiEnvelopeResponse(LeadResponseDto)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leads.remove(tenant, id);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.LEADS_UPDATE)
  @ApiOperation({ summary: 'Change lead status (CONVERTED only via /convert)' })
  @ApiEnvelopeResponse(LeadResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'LEAD_ALREADY_CONVERTED')
  changeStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeLeadStatusDto,
  ) {
    return this.leads.changeStatus(tenant, id, dto);
  }

  @Patch(':id/assign')
  @RequirePermissions(PERMISSIONS.LEADS_ASSIGN)
  @ApiOperation({ summary: 'Assign (or unassign) a lead to a member' })
  @ApiEnvelopeResponse(LeadResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'LEAD_ASSIGNEE_NOT_MEMBER')
  assign(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignLeadDto,
  ) {
    return this.leads.assign(tenant, id, dto);
  }

  @Patch(':id/follow-up')
  @RequirePermissions(PERMISSIONS.LEADS_UPDATE)
  @ApiOperation({ summary: 'Set or clear the next follow-up date' })
  @ApiEnvelopeResponse(LeadResponseDto)
  setFollowUp(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetFollowUpDto,
  ) {
    return this.leads.setFollowUp(tenant, id, dto);
  }

  @Post(':id/activities')
  @RequirePermissions(PERMISSIONS.LEADS_ACTIVITY_CREATE)
  @ApiOperation({ summary: 'Log an activity (call, message, meeting, trial, note)' })
  @ApiEnvelopeResponse(LeadActivityResponseDto, HttpStatus.CREATED)
  addActivity(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeadActivityDto,
  ) {
    return this.leads.addActivity(tenant, id, dto);
  }

  @Get(':id/activities')
  @RequirePermissions(PERMISSIONS.LEADS_ACTIVITY_READ)
  @ApiOperation({ summary: 'Lead activity history (newest first)' })
  @ApiPaginatedResponse(LeadActivityResponseDto)
  listActivities(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListActivitiesQueryDto,
  ) {
    return this.leads.listActivities(tenant, id, query);
  }

  @Post(':id/convert')
  @RequirePermissions(PERMISSIONS.LEADS_CONVERT)
  @ApiOperation({ summary: 'Convert a lead into a family, student and optional enrollment' })
  @ApiEnvelopeResponse(LeadConversionResultDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'LEAD_ALREADY_CONVERTED')
  convert(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertLeadDto,
  ) {
    return this.leads.convert(tenant, id, dto);
  }
}

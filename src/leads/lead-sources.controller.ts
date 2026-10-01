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
} from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  CreateLeadSourceDto,
  LeadSourceResponseDto,
  ListLeadSourcesQueryDto,
  UpdateLeadSourceDto,
} from './dto/lead-source.dto';
import { LeadSourcesService } from './lead-sources.service';

@ApiTags('Lead Sources')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly sources: LeadSourcesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.LEAD_SOURCES_MANAGE)
  @ApiOperation({ summary: 'Create a lead source' })
  @ApiEnvelopeResponse(LeadSourceResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'LEAD_SOURCE_CODE_TAKEN')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateLeadSourceDto) {
    return this.sources.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.LEAD_SOURCES_READ)
  @ApiOperation({ summary: 'List lead sources' })
  @ApiEnvelopeArrayResponse(LeadSourceResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListLeadSourcesQueryDto) {
    return this.sources.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.LEAD_SOURCES_READ)
  @ApiOperation({ summary: 'Get a lead source' })
  @ApiEnvelopeResponse(LeadSourceResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'LEAD_SOURCE_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sources.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LEAD_SOURCES_MANAGE)
  @ApiOperation({ summary: 'Update a lead source' })
  @ApiEnvelopeResponse(LeadSourceResponseDto)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadSourceDto,
  ) {
    return this.sources.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.LEAD_SOURCES_MANAGE)
  @ApiOperation({ summary: 'Deactivate a lead source (soft delete)' })
  @ApiEnvelopeResponse(LeadSourceResponseDto)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sources.remove(tenant, id);
  }
}

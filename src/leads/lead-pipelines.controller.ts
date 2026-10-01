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
  CreateLeadPipelineDto,
  CreateLeadStageDto,
  LeadPipelineResponseDto,
  LeadStageResponseDto,
  UpdateLeadPipelineDto,
} from './dto/lead-pipeline.dto';
import { LeadPipelinesService } from './lead-pipelines.service';

@ApiTags('Lead Pipelines')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('lead-pipelines')
export class LeadPipelinesController {
  constructor(private readonly pipelines: LeadPipelinesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.LEAD_PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Create a pipeline' })
  @ApiEnvelopeResponse(LeadPipelineResponseDto, HttpStatus.CREATED)
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateLeadPipelineDto) {
    return this.pipelines.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.LEAD_PIPELINE_READ)
  @ApiOperation({ summary: 'List pipelines with their stages' })
  @ApiEnvelopeArrayResponse(LeadPipelineResponseDto)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.pipelines.list(tenant);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.LEAD_PIPELINE_READ)
  @ApiOperation({ summary: 'Get a pipeline with its stages' })
  @ApiEnvelopeResponse(LeadPipelineResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'LEAD_PIPELINE_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.pipelines.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LEAD_PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Update a pipeline' })
  @ApiEnvelopeResponse(LeadPipelineResponseDto)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadPipelineDto,
  ) {
    return this.pipelines.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.LEAD_PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Delete a pipeline (blocked if leads sit in its stages)' })
  @ApiErrorResponse(HttpStatus.CONFLICT, 'LEAD_PIPELINE_HAS_LEADS')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.pipelines.remove(tenant, id);
  }

  @Get(':id/stages')
  @RequirePermissions(PERMISSIONS.LEAD_PIPELINE_READ)
  @ApiOperation({ summary: 'List a pipeline stages' })
  @ApiEnvelopeArrayResponse(LeadStageResponseDto)
  listStages(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.pipelines.listStages(tenant, id);
  }

  @Post(':id/stages')
  @RequirePermissions(PERMISSIONS.LEAD_PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Add a stage to a pipeline' })
  @ApiEnvelopeResponse(LeadStageResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'LEAD_STAGE_CODE_TAKEN')
  addStage(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeadStageDto,
  ) {
    return this.pipelines.addStage(tenant, id, dto);
  }
}

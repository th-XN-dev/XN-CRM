import { Body, Controller, Delete, HttpStatus, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse, ApiErrorResponse } from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { LeadStageResponseDto, UpdateLeadStageDto } from './dto/lead-pipeline.dto';
import { LeadPipelinesService } from './lead-pipelines.service';

@ApiTags('Lead Pipelines')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('lead-stages')
export class LeadStagesController {
  constructor(private readonly pipelines: LeadPipelinesService) {}

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LEAD_PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Update a stage' })
  @ApiEnvelopeResponse(LeadStageResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'LEAD_STAGE_NOT_FOUND')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadStageDto,
  ) {
    return this.pipelines.updateStage(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.LEAD_PIPELINE_MANAGE)
  @ApiOperation({ summary: 'Delete a stage (blocked if leads sit in it)' })
  @ApiErrorResponse(HttpStatus.CONFLICT, 'LEAD_STAGE_HAS_LEADS')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.pipelines.removeStage(tenant, id);
  }
}

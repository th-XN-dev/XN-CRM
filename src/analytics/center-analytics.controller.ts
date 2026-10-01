import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { ApiEnvelopeResponse } from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { ReportQueryDto } from '../reports/common/report-query.dto';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { CenterAnalyticsService } from './center-analytics.service';
import { CenterAnalyticsDto } from './dto/metrics.dto';

export class CenterAnalyticsQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsUUID()
  subCenterId?: string;
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class CenterAnalyticsController {
  constructor(private readonly analytics: CenterAnalyticsService) {}

  @Get('center')
  @OrganizationScoped()
  @RequirePermissions(PERMISSIONS.ANALYTICS_CENTER_READ)
  @ApiOperation({
    summary: 'Center analytics by sub-center and branch (filters: subCenterId, branchId, period)',
  })
  @ApiEnvelopeResponse(CenterAnalyticsDto)
  center(@CurrentTenant() tenant: TenantContext, @Query() query: CenterAnalyticsQueryDto) {
    // A center-wide view: the header's branch (X-Branch-Id) does not narrow it, ?branchId= does.
    return this.analytics.forCenter(tenant.organizationId, tenant, query);
  }
}

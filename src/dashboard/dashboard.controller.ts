import { Body, Controller, Delete, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { SkipAudit } from '../audit/audit.interceptor';
import {
  DashboardAnalyticsDto,
  DashboardAnalyticsQueryDto,
  DashboardLayoutDto,
  DashboardLayoutResponseDto,
} from './dashboard-analytics.dto';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { DashboardLayoutService } from './dashboard-layout.service';
import { DashboardOverviewDto, DashboardQueryDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly analyticsService: DashboardAnalyticsService,
    private readonly layouts: DashboardLayoutService,
  ) {}

  @Get('analytics')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  @ApiOperation({
    summary:
      'Students, money and attendance for a period and slice (sub-center, branch, group, course, level, teacher, cashier), with the previous period and series',
  })
  @ApiEnvelopeResponse(DashboardAnalyticsDto)
  analytics(@CurrentTenant() tenant: TenantContext, @Query() query: DashboardAnalyticsQueryDto) {
    return this.analyticsService.analytics(tenant, query);
  }

  @Get('layout')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  @ApiOperation({ summary: 'My dashboard: widget order, visibility, chart types, saved filters' })
  @ApiEnvelopeResponse(DashboardLayoutResponseDto)
  layout(@CurrentTenant() tenant: TenantContext) {
    return this.layouts.get(tenant);
  }

  @Put('layout')
  @SkipAudit()
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  @ApiEnvelopeResponse(DashboardLayoutResponseDto)
  saveLayout(@CurrentTenant() tenant: TenantContext, @Body() dto: DashboardLayoutDto) {
    return this.layouts.save(tenant, dto);
  }

  @Delete('layout')
  @SkipAudit()
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  @ApiOperation({ summary: 'Back to the default dashboard' })
  @ApiEnvelopeResponse(DashboardLayoutResponseDto)
  resetLayout(@CurrentTenant() tenant: TenantContext) {
    return this.layouts.reset(tenant);
  }

  @Get('overview')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  @ApiOperation({
    summary: 'Home-screen metrics for a period (sections follow the caller permissions)',
  })
  @ApiEnvelopeResponse(DashboardOverviewDto)
  overview(@CurrentTenant() tenant: TenantContext, @Query() query: DashboardQueryDto) {
    return this.dashboard.overview(tenant, query);
  }
}

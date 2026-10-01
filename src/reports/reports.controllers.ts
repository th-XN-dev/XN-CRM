import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  AttendanceRankingQueryDto,
  AttendanceReportQueryDto,
  StudentReportQueryDto,
} from './academic/academic-report.dto';
import { AttendanceReportsService } from './academic/attendance-reports.service';
import { StudentReportsService } from './academic/student-reports.service';
import { ReportPageQueryDto, ReportQueryDto } from './common/report-query.dto';
import {
  AttendanceRankingReportDto,
  AttendanceSummaryReportDto,
  DebtReportDto,
  ExpensesReportDto,
  FinanceSummaryReportDto,
  LeadPipelineReportDto,
  LeadSourcesReportDto,
  LeadSummaryReportDto,
  PaymentsReportDto,
  RevenueReportDto,
  StudentGrowthReportDto,
  StudentStatusReportDto,
  StudentSummaryReportDto,
  TaskEmployeesReportDto,
  TaskSummaryReportDto,
} from './common/report-response.dto';
import {
  LeadPipelineReportQueryDto,
  LeadReportQueryDto,
  TaskEmployeesReportQueryDto,
  TaskReportQueryDto,
} from './crm/crm-report.dto';
import { LeadReportsService } from './crm/lead-reports.service';
import { TaskReportsService } from './crm/task-reports.service';
import { FinanceReportsService } from './finance/finance-reports.service';

// Every report takes `?period=today|week|month|quarter|year` (default month) or
// `?from=&to=` (custom), plus `?branchId=`; dates follow the organization's timezone.

@ApiTags('Reports · Finance')
@ApiBearerAuth()
@OrganizationScoped()
@RequirePermissions(PERMISSIONS.FINANCE_REPORT_READ)
@Controller('reports/finance')
export class FinanceReportsController {
  constructor(private readonly reports: FinanceReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Invoiced, paid, refunded, expenses, net revenue, debt, by method' })
  @ApiEnvelopeResponse(FinanceSummaryReportDto)
  summary(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reports.summary(tenant, query);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Income and refunds per day/month' })
  @ApiEnvelopeResponse(RevenueReportDto)
  revenue(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reports.revenue(tenant, query);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'Expenses by category and per day/month' })
  @ApiEnvelopeResponse(ExpensesReportDto)
  expenses(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reports.expenses(tenant, query);
  }

  @Get('debt')
  @ApiOperation({ summary: 'Receivables as of today: aging buckets and top debtor families' })
  @ApiEnvelopeResponse(DebtReportDto)
  debt(@CurrentTenant() tenant: TenantContext, @Query() query: ReportPageQueryDto) {
    return this.reports.debt(tenant, query);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Payments by method and by cashier' })
  @ApiEnvelopeResponse(PaymentsReportDto)
  payments(@CurrentTenant() tenant: TenantContext, @Query() query: ReportQueryDto) {
    return this.reports.payments(tenant, query);
  }
}

@ApiTags('Reports · Students')
@ApiBearerAuth()
@OrganizationScoped()
@RequirePermissions(PERMISSIONS.REPORTS_ACADEMIC_READ)
@Controller('reports/students')
export class StudentReportsController {
  constructor(private readonly reports: StudentReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Totals by status, new and left students, growth' })
  @ApiEnvelopeResponse(StudentSummaryReportDto)
  summary(@CurrentTenant() tenant: TenantContext, @Query() query: StudentReportQueryDto) {
    return this.reports.summary(tenant, query);
  }

  @Get('growth')
  @ApiOperation({ summary: 'Joined vs left per day/month' })
  @ApiEnvelopeResponse(StudentGrowthReportDto)
  growth(@CurrentTenant() tenant: TenantContext, @Query() query: StudentReportQueryDto) {
    return this.reports.growth(tenant, query);
  }

  @Get('status')
  @ApiOperation({ summary: 'Status mix, overall and per branch' })
  @ApiEnvelopeResponse(StudentStatusReportDto)
  status(@CurrentTenant() tenant: TenantContext, @Query() query: StudentReportQueryDto) {
    return this.reports.status(tenant, query);
  }
}

@ApiTags('Reports · Attendance')
@ApiBearerAuth()
@OrganizationScoped()
@RequirePermissions(PERMISSIONS.REPORTS_ACADEMIC_READ)
@Controller('reports/attendance')
export class AttendanceReportsController {
  constructor(private readonly reports: AttendanceReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Lessons, marks by status and attendance rate' })
  @ApiEnvelopeResponse(AttendanceSummaryReportDto)
  summary(@CurrentTenant() tenant: TenantContext, @Query() query: AttendanceReportQueryDto) {
    return this.reports.summary(tenant, query);
  }

  @Get('groups')
  @ApiOperation({ summary: 'Groups ranked by attendance rate (lowest first)' })
  @ApiEnvelopeResponse(AttendanceRankingReportDto)
  groups(@CurrentTenant() tenant: TenantContext, @Query() query: AttendanceRankingQueryDto) {
    return this.reports.groups(tenant, query);
  }

  @Get('students')
  @ApiOperation({ summary: 'Students ranked by attendance rate (lowest first)' })
  @ApiEnvelopeResponse(AttendanceRankingReportDto)
  students(@CurrentTenant() tenant: TenantContext, @Query() query: AttendanceRankingQueryDto) {
    return this.reports.students(tenant, query);
  }
}

@ApiTags('Reports · Leads')
@ApiBearerAuth()
@OrganizationScoped()
@RequirePermissions(PERMISSIONS.LEADS_REPORT_READ)
@Controller('reports/leads')
export class LeadReportsController {
  constructor(private readonly reports: LeadReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Funnel counts, conversion and trial attendance rates' })
  @ApiEnvelopeResponse(LeadSummaryReportDto)
  summary(@CurrentTenant() tenant: TenantContext, @Query() query: LeadReportQueryDto) {
    return this.reports.summary(tenant, query);
  }

  @Get('sources')
  @ApiOperation({ summary: 'Leads per source with conversion rate' })
  @ApiEnvelopeResponse(LeadSourcesReportDto)
  sources(@CurrentTenant() tenant: TenantContext, @Query() query: LeadReportQueryDto) {
    return this.reports.sources(tenant, query);
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'Leads per pipeline stage and per status' })
  @ApiEnvelopeResponse(LeadPipelineReportDto)
  pipeline(@CurrentTenant() tenant: TenantContext, @Query() query: LeadPipelineReportQueryDto) {
    return this.reports.pipeline(tenant, query);
  }
}

@ApiTags('Reports · Tasks')
@ApiBearerAuth()
@OrganizationScoped()
@RequirePermissions(PERMISSIONS.TASKS_STATISTICS_READ)
@Controller('reports/tasks')
export class TaskReportsController {
  constructor(private readonly reports: TaskReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Task counts by status and overdue' })
  @ApiEnvelopeResponse(TaskSummaryReportDto)
  summary(@CurrentTenant() tenant: TenantContext, @Query() query: TaskReportQueryDto) {
    return this.reports.summary(tenant, query);
  }

  @Get('employees')
  @ApiOperation({ summary: 'Per employee: assigned, completed, overdue, completion rate' })
  @ApiEnvelopeResponse(TaskEmployeesReportDto)
  employees(@CurrentTenant() tenant: TenantContext, @Query() query: TaskEmployeesReportQueryDto) {
    return this.reports.employees(tenant, query);
  }
}

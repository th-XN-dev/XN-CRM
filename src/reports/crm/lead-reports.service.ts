import { Injectable } from '@nestjs/common';
import { LeadStatus, type Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../database/prisma.service';
import { leadAccessWhere } from '../../leads/lead.access';
import { LeadStatsService } from '../../leads/lead-stats.service';
import { branchListFilter } from '../../tenancy/branch-scope';
import { type TenantContext } from '../../tenancy/tenant-context';
import { type ReportPeriod, resolvePeriod } from '../common/report-period';
import { percent, periodInfo } from '../common/report-scope';
import { type LeadPipelineReportQueryDto, type LeadReportQueryDto } from './crm-report.dto';

/** CRM funnel reports over leads created in the period. */
@Injectable()
export class LeadReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: LeadStatsService,
  ) {}

  /** Funnel counts, conversion and trial attendance rates (shared with GET /leads/stats). */
  async summary(tenant: TenantContext, query: LeadReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const stats = await this.stats.stats(tenant, {
      branchId: query.branchId,
      assignedToId: query.assignedToId,
      from: period.start.toISOString(),
      to: new Date(period.end.getTime() - 1).toISOString(),
    });
    const { bySource: _bySource, ...counts } = stats;
    return {
      period: periodInfo(period),
      ...counts,
      /** Leads currently in a trial stage (booked or attended). */
      trial: counts.trialBooked + counts.trialAttended,
    };
  }

  /** Every lead source with its volume and outcome. */
  async sources(tenant: TenantContext, query: LeadReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const [rows, sources] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['sourceId', 'status'],
        where: this.where(tenant, query, period),
        _count: { _all: true },
        orderBy: [{ sourceId: 'asc' }, { status: 'asc' }],
      }),
      this.prisma.leadSource.findMany({
        where: { organizationId: tenant.organizationId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, isActive: true },
      }),
    ]);
    const line = (sourceId: string | null) => {
      const mine = rows.filter((row) => row.sourceId === sourceId);
      const count = (status: LeadStatus) =>
        mine.find((row) => row.status === status)?._count._all ?? 0;
      const total = mine.reduce((sum, row) => sum + row._count._all, 0);
      const converted = count(LeadStatus.CONVERTED);
      const lost = count(LeadStatus.LOST);
      return {
        total,
        open: total - converted - lost,
        converted,
        lost,
        conversionRate: percent(converted, total),
      };
    };
    const bySource = sources
      .map((source) => ({
        sourceId: source.id,
        name: source.name,
        code: source.code,
        ...line(source.id),
      }))
      // Inactive sources only matter if they still produced leads.
      .filter((row, index) => sources[index].isActive || row.total > 0)
      .sort((a, b) => b.total - a.total);
    const unknown = line(null);
    return {
      period: periodInfo(period),
      totalLeads: rows.reduce((sum, row) => sum + row._count._all, 0),
      bySource:
        unknown.total > 0
          ? [...bySource, { sourceId: null, name: null, code: null, ...unknown }]
          : bySource,
    };
  }

  /** Where the period's leads sit on a pipeline's stages, plus the status funnel. */
  async pipeline(tenant: TenantContext, query: LeadPipelineReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const pipeline = await this.prisma.leadPipeline.findFirst({
      where: {
        organizationId: tenant.organizationId,
        ...(query.pipelineId ? { id: query.pipelineId } : { isDefault: true }),
      },
      select: {
        id: true,
        name: true,
        stages: {
          orderBy: { order: 'asc' },
          select: { id: true, name: true, code: true, order: true },
        },
      },
    });
    if (!pipeline) {
      throw AppException.notFound(ErrorCode.LEAD_PIPELINE_NOT_FOUND, 'Lead pipeline not found');
    }
    const where = this.where(tenant, query, period);
    const [byStage, byStatus] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['stageId'],
        where: { ...where, stageId: { in: pipeline.stages.map((stage) => stage.id) } },
        _count: { _all: true },
        orderBy: { stageId: 'asc' },
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
    ]);
    return {
      period: periodInfo(period),
      pipeline: { id: pipeline.id, name: pipeline.name },
      stages: pipeline.stages.map((stage) => ({
        stageId: stage.id,
        name: stage.name,
        code: stage.code,
        order: stage.order,
        count: byStage.find((row) => row.stageId === stage.id)?._count._all ?? 0,
      })),
      byStatus: Object.fromEntries(
        Object.values(LeadStatus).map((status) => [
          status,
          byStatus.find((row) => row.status === status)?._count._all ?? 0,
        ]),
      ),
    };
  }

  private where(
    tenant: TenantContext,
    query: LeadReportQueryDto,
    period: ReportPeriod,
  ): Prisma.LeadWhereInput {
    return {
      AND: [
        leadAccessWhere(tenant),
        {
          branchId: branchListFilter(tenant, query.branchId),
          assignedToId: query.assignedToId,
          sourceId: query.sourceId,
          createdAt: { gte: period.start, lt: period.end },
        },
      ],
    };
  }
}

import { Injectable } from '@nestjs/common';
import { CenterStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../database/prisma.service';
import { resolvePeriod } from '../reports/common/report-period';
import { type ReportQueryDto } from '../reports/common/report-query.dto';
import { periodInfo } from '../reports/common/report-scope';
import { assertBranchAccess, restrictedBranchIds } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  emptyMetrics,
  HierarchyMetricsService,
  sumMetrics,
  type UnitMetrics,
} from './hierarchy-metrics.service';

export interface CenterAnalyticsQuery extends ReportQueryDto {
  subCenterId?: string;
}

/**
 * Center → Sub-Center → Branch analytics. Directors call it through their
 * tenant context (limited to the branches they may access); the platform
 * owner calls it for any center with `tenant = null`.
 */
@Injectable()
export class CenterAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: HierarchyMetricsService,
  ) {}

  async forCenter(
    organizationId: string,
    tenant: TenantContext | null,
    query: CenterAnalyticsQuery,
  ) {
    const center = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true, name: true, currency: true, timezone: true },
    });
    if (!center) throw AppException.notFound(ErrorCode.ORGANIZATION_NOT_FOUND, 'Center not found');
    const period = resolvePeriod(query, center.timezone);
    if (tenant && query.branchId) assertBranchAccess(tenant, query.branchId);
    const restricted = tenant ? restrictedBranchIds(tenant) : null;

    const [subCenters, allBranches] = await Promise.all([
      this.prisma.subCenter.findMany({
        where: { organizationId, status: { not: CenterStatus.ARCHIVED } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, status: true },
      }),
      this.prisma.branch.findMany({
        where: {
          organizationId,
          deletedAt: null,
          ...(restricted && { id: { in: restricted } }),
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, isActive: true, subCenterId: true },
      }),
    ]);
    if (query.subCenterId && !subCenters.some((s) => s.id === query.subCenterId)) {
      throw AppException.notFound(ErrorCode.SUB_CENTER_NOT_FOUND, 'Sub-center not found');
    }
    const branches = allBranches.filter(
      (branch) =>
        (!query.subCenterId || branch.subCenterId === query.subCenterId) &&
        (!query.branchId || branch.id === query.branchId),
    );
    const byBranch = branches.length
      ? await this.metrics.collect(
          { dimension: 'branch', organizationId, branchIds: branches.map((b) => b.id) },
          period,
        )
      : new Map<string, UnitMetrics>();

    const branchRows = branches.map((branch) => ({
      ...branch,
      metrics: byBranch.get(branch.id) ?? emptyMetrics(),
    }));
    const groups = [
      ...subCenters.map((sub) => ({ ...sub })),
      // Branches that sit directly under the center.
      { id: null, name: null, code: null, status: null },
    ]
      .map((group) => {
        const members = branchRows.filter((row) => row.subCenterId === group.id);
        return {
          ...group,
          branchCount: members.length,
          metrics: sumMetrics(members.map((row) => row.metrics)),
        };
      })
      // Direct branches only when there are some; with a branch filter, only its group.
      .filter((group) => (group.id !== null && !query.branchId) || group.branchCount > 0)
      .filter((group) => !query.subCenterId || group.id === query.subCenterId);

    return {
      period: periodInfo(period),
      center: { id: center.id, name: center.name, currency: center.currency },
      totals: sumMetrics(branchRows.map((row) => row.metrics)),
      subCenters: groups,
      branches: branchRows,
    };
  }
}

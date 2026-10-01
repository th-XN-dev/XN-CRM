import { Injectable } from '@nestjs/common';
import { CenterStatus, MembershipStatus } from '@prisma/client';
import {
  emptyMetrics,
  HierarchyMetricsService,
  sumMetrics,
} from '../../analytics/hierarchy-metrics.service';
import { PrismaService } from '../../database/prisma.service';
import { resolvePeriod } from '../../reports/common/report-period';
import { type ReportQueryDto } from '../../reports/common/report-query.dto';
import { periodInfo } from '../../reports/common/report-scope';
import { centerAvailability } from '../center-availability';

/** Period boundaries of platform-wide analytics (centers keep their own timezone for access). */
export const PLATFORM_TIMEZONE = 'Asia/Tashkent';

/**
 * Platform-wide numbers for the owner: the center lifecycle counts, totals
 * and one comparable row per center. Everything is aggregated in SQL.
 */
@Injectable()
export class OwnerAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: HierarchyMetricsService,
  ) {}

  async overview(query: Pick<ReportQueryDto, 'period' | 'from' | 'to'>) {
    const period = resolvePeriod(query, PLATFORM_TIMEZONE);
    const [centers, byCenter, users] = await Promise.all([
      this.prisma.organization.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          primaryColor: true,
          status: true,
          activeFrom: true,
          activeUntil: true,
          timezone: true,
          currency: true,
        },
      }),
      this.metrics.collect({ dimension: 'center' }, period),
      // People who can work in at least one non-archived center.
      this.prisma.user.count({
        where: {
          deletedAt: null,
          isActive: true,
          memberships: {
            some: {
              status: MembershipStatus.ACTIVE,
              organization: { deletedAt: null, status: { not: CenterStatus.ARCHIVED } },
            },
          },
        },
      }),
    ]);

    const rows = centers
      .filter((center) => center.status !== CenterStatus.ARCHIVED)
      .map(({ timezone: _tz, ...center }) => ({
        ...center,
        availability: centerAvailability({ ...center, timezone: _tz }),
        metrics: byCenter.get(center.id) ?? emptyMetrics(),
      }));
    const count = (predicate: (c: (typeof rows)[number]) => boolean) =>
      rows.filter(predicate).length;

    return {
      period: periodInfo(period),
      centers: {
        total: rows.length,
        active: count((c) => c.availability === 'ACTIVE'),
        frozen: count((c) => c.status === CenterStatus.FROZEN),
        /** ACTIVE by status but outside the activation period. */
        outOfPeriod: count((c) => c.availability === 'EXPIRED' || c.availability === 'NOT_STARTED'),
        archived: centers.length - rows.length,
      },
      users,
      totals: sumMetrics(rows.map((row) => row.metrics)),
      /** Money totals add up amounts in different currencies when centers differ. */
      currencies: [...new Set(rows.map((row) => row.currency))].sort(),
      rows,
    };
  }
}

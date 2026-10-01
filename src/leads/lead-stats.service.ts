import { Injectable } from '@nestjs/common';
import { LeadActivityType, LeadStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { branchListFilter } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { type LeadStatsQueryDto, type LeadStatsResponseDto } from './dto/lead-stats-query.dto';
import { leadAccessWhere } from './lead.access';

/** Funnel order (LOST is a drop-off, not a rank). */
const FUNNEL_ORDER: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
  LeadStatus.TRIAL_BOOKED,
  LeadStatus.TRIAL_ATTENDED,
  LeadStatus.NEGOTIATION,
  LeadStatus.CONVERTED,
];

@Injectable()
export class LeadStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(tenant: TenantContext, query: LeadStatsQueryDto): Promise<LeadStatsResponseDto> {
    const where: Prisma.LeadWhereInput = {
      AND: [
        leadAccessWhere(tenant),
        {
          branchId: branchListFilter(tenant, query.branchId),
          assignedToId: query.assignedToId,
          ...((query.from || query.to) && {
            createdAt: {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            },
          }),
        },
      ],
    };

    const [byStatus, bySourceRaw] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.lead.groupBy({
        by: ['sourceId'],
        where,
        _count: { _all: true },
        orderBy: { sourceId: 'asc' },
      }),
    ]);

    const count = (status: LeadStatus): number =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    const counts = {
      new: count(LeadStatus.NEW),
      contacted: count(LeadStatus.CONTACTED),
      qualified: count(LeadStatus.QUALIFIED),
      trialBooked: count(LeadStatus.TRIAL_BOOKED),
      trialAttended: count(LeadStatus.TRIAL_ATTENDED),
      negotiation: count(LeadStatus.NEGOTIATION),
      converted: count(LeadStatus.CONVERTED),
      lost: count(LeadStatus.LOST),
    };
    const totalLeads = byStatus.reduce((sum, row) => sum + row._count._all, 0);

    // "Reached at least stage X" = leads whose current status is at or beyond X.
    const reached = (status: LeadStatus): number => {
      const from = FUNNEL_ORDER.indexOf(status);
      return FUNNEL_ORDER.slice(from).reduce((sum, s) => sum + count(s), 0);
    };
    const reachedQualified = reached(LeadStatus.QUALIFIED);
    // Trials are optional: a lead converted straight from QUALIFIED never booked one,
    // so trial rates come from what each lead actually went through.
    const [trialBooked, trialAttended] = await Promise.all([
      this.countPassedThrough(where, [LeadStatus.TRIAL_BOOKED, LeadStatus.TRIAL_ATTENDED]),
      this.countPassedThrough(where, [LeadStatus.TRIAL_ATTENDED]),
    ]);

    const sourceIds = bySourceRaw
      .map((row) => row.sourceId)
      .filter((id): id is string => id !== null);
    const sources = sourceIds.length
      ? await this.prisma.leadSource.findMany({
          where: { id: { in: sourceIds }, organizationId: tenant.organizationId },
          select: { id: true, name: true, code: true },
        })
      : [];
    const sourceById = new Map(sources.map((s) => [s.id, s]));
    const bySource = bySourceRaw
      .map((row) => {
        const source = row.sourceId ? sourceById.get(row.sourceId) : undefined;
        return {
          sourceId: row.sourceId,
          name: source?.name ?? null,
          code: source?.code ?? null,
          count: row._count._all,
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      totalLeads,
      ...counts,
      conversionRate: rate(counts.converted, reachedQualified),
      trialAttendanceRate: rate(trialAttended, trialBooked),
      bySource,
    };
  }

  /** Leads that are in, or were ever moved to, one of `statuses` (status history). */
  private countPassedThrough(where: Prisma.LeadWhereInput, statuses: LeadStatus[]) {
    return this.prisma.lead.count({
      where: {
        AND: [
          where,
          {
            OR: [
              { status: { in: statuses } },
              {
                activities: {
                  some: {
                    type: LeadActivityType.STATUS_CHANGED,
                    OR: statuses.map((status) => ({ metadata: { path: ['to'], equals: status } })),
                  },
                },
              },
            ],
          },
        ],
      },
    });
  }
}

/** Safe percentage, rounded to 2 decimals; 0 when the denominator is 0. */
function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

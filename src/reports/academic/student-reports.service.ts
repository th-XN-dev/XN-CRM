import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { scopedBranchWhere } from '../../tenancy/branch-scope';
import { type TenantContext } from '../../tenancy/tenant-context';
import { periodBuckets, resolvePeriod } from '../common/report-period';
import { bucketUnit, periodInfo, sqlBranchFilter } from '../common/report-scope';
import { type StudentReportQueryDto } from './academic-report.dto';

type CountRow = { bucket: Date; count: number };

/** Student head-count, status mix and growth (joined vs left) for a period. */
@Injectable()
export class StudentReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenant: TenantContext, query: StudentReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const where = studentWhere(tenant, query);
    const days = { gte: period.fromDate, lte: period.toDate };
    const [byStatus, newStudents, leftStudents] = await Promise.all([
      this.prisma.student.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.student.count({ where: { ...where, joinedAt: days } }),
      this.prisma.student.count({ where: { ...where, leftAt: days } }),
    ]);
    const count = (status: StudentStatus) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;
    return {
      period: periodInfo(period),
      totalStudents: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      active: count(StudentStatus.ACTIVE),
      frozen: count(StudentStatus.FROZEN),
      graduated: count(StudentStatus.GRADUATED),
      left: count(StudentStatus.LEFT),
      newStudents,
      leftStudents,
      /** newStudents − leftStudents in the period. */
      growth: newStudents - leftStudents,
    };
  }

  /** Joined vs left per day (or month), zero-filled. */
  async growth(tenant: TenantContext, query: StudentReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const unit = bucketUnit(period);
    const branch = sqlBranchFilter(tenant, Prisma.sql`s.branch_id`, query.branchId);
    const enrolled = enrolledFilter(query);
    const range = (column: Prisma.Sql) =>
      Prisma.sql`${column} BETWEEN ${period.fromDate}::date AND ${period.toDate}::date`;
    const [joined, left] = await Promise.all([
      this.prisma.$queryRaw<CountRow[]>`
        SELECT date_trunc(${unit}, s.joined_at)::date AS bucket, COUNT(*)::int AS count
        FROM students s
        WHERE s.organization_id = ${tenant.organizationId}::uuid
          AND ${range(Prisma.sql`s.joined_at`)} ${branch} ${enrolled}
        GROUP BY 1`,
      this.prisma.$queryRaw<CountRow[]>`
        SELECT date_trunc(${unit}, s.left_at)::date AS bucket, COUNT(*)::int AS count
        FROM students s
        WHERE s.organization_id = ${tenant.organizationId}::uuid
          AND ${range(Prisma.sql`s.left_at`)} ${branch} ${enrolled}
        GROUP BY 1`,
    ]);
    const joinedBy = countsByBucket(joined);
    const leftBy = countsByBucket(left);
    const series = periodBuckets(period).map((bucket) => {
      const j = joinedBy.get(bucket) ?? 0;
      const l = leftBy.get(bucket) ?? 0;
      return { bucket, joined: j, left: l, net: j - l };
    });
    return {
      period: periodInfo(period),
      granularity: period.granularity,
      joined: series.reduce((sum, row) => sum + row.joined, 0),
      left: series.reduce((sum, row) => sum + row.left, 0),
      series,
    };
  }

  /** Current status mix per branch. */
  async status(tenant: TenantContext, query: StudentReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const rows = await this.prisma.student.groupBy({
      by: ['branchId', 'status'],
      where: studentWhere(tenant, query),
      _count: { _all: true },
      orderBy: [{ branchId: 'asc' }, { status: 'asc' }],
    });
    const branches = await this.prisma.branch.findMany({
      where: { organizationId: tenant.organizationId, id: { in: rows.map((r) => r.branchId) } },
      select: { id: true, name: true },
    });
    const statuses = Object.values(StudentStatus);
    return {
      period: periodInfo(period),
      byStatus: Object.fromEntries(
        statuses.map((status) => [
          status,
          rows.filter((r) => r.status === status).reduce((sum, r) => sum + r._count._all, 0),
        ]),
      ),
      byBranch: branches.map((branch) => ({
        branchId: branch.id,
        name: branch.name,
        ...Object.fromEntries(
          statuses.map((status) => [
            status,
            rows.find((r) => r.branchId === branch.id && r.status === status)?._count._all ?? 0,
          ]),
        ),
      })),
    };
  }
}

function studentWhere(
  tenant: TenantContext,
  query: StudentReportQueryDto,
): Prisma.StudentWhereInput {
  return {
    ...scopedBranchWhere(tenant, query.branchId),
    ...((query.groupId || query.courseId) && {
      enrollments: {
        some: {
          status: EnrollmentStatus.ACTIVE,
          groupId: query.groupId,
          ...(query.courseId && { group: { courseId: query.courseId } }),
        },
      },
    }),
  };
}

function enrolledFilter(query: StudentReportQueryDto): Prisma.Sql {
  if (!query.groupId && !query.courseId) return Prisma.empty;
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM enrollments e JOIN groups g ON g.id = e.group_id
    WHERE e.student_id = s.id AND e.status = 'ACTIVE'
      ${query.groupId ? Prisma.sql`AND e.group_id = ${query.groupId}::uuid` : Prisma.empty}
      ${query.courseId ? Prisma.sql`AND g.course_id = ${query.courseId}::uuid` : Prisma.empty})`;
}

function countsByBucket(rows: CountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.bucket.toISOString().slice(0, 10), row.count]));
}

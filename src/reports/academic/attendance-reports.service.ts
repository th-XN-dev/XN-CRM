import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { attendancePercentage, toCounts, totalOf } from '../../attendance/attendance-stats';
import { Paginated } from '../../common/pagination/paginated';
import { PrismaService } from '../../database/prisma.service';
import { scopedBranchWhere } from '../../tenancy/branch-scope';
import { type TenantContext } from '../../tenancy/tenant-context';
import { type ReportPeriod, resolvePeriod } from '../common/report-period';
import { periodInfo, sqlBranchFilter } from '../common/report-scope';
import {
  type AttendanceRankingQueryDto,
  type AttendanceReportQueryDto,
} from './academic-report.dto';

interface RankedRow {
  id: string;
  name: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  lessons: number;
  rows: number;
}

/**
 * Attendance statistics. Rate = (PRESENT + LATE) / TOTAL marks × 100, the
 * same formula as the per-group/per-student endpoints (attendance-stats.ts).
 */
@Injectable()
export class AttendanceReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenant: TenantContext, query: AttendanceReportQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const where: Prisma.AttendanceWhereInput = {
      ...scopedBranchWhere(tenant, query.branchId),
      date: { gte: period.fromDate, lte: period.toDate },
      groupId: query.groupId,
      ...((query.courseId || query.teacherId) && {
        group: { courseId: query.courseId, teacherId: query.teacherId },
      }),
    };
    const [byStatus, sessions] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      // One lesson = one group on one day.
      this.prisma.attendance.groupBy({ by: ['groupId', 'date'], where, orderBy: { date: 'asc' } }),
    ]);
    const counts = toCounts(byStatus);
    return {
      period: periodInfo(period),
      totalLessons: sessions.length,
      totalMarks: totalOf(counts),
      ...counts,
      attendanceRate: attendancePercentage(counts) ?? 0,
    };
  }

  /** Groups ranked by attendance rate (lowest first). */
  async groups(tenant: TenantContext, query: AttendanceRankingQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const rows = await this.prisma.$queryRaw<RankedRow[]>`
      ${rankedSelect}
        a.group_id AS id, g.name AS name
      FROM attendance a JOIN groups g ON g.id = a.group_id
      WHERE ${this.filters(tenant, query, period)}
      GROUP BY a.group_id, g.name
      ${rankedOrder(query)}`;
    return this.page(rows, query, period);
  }

  /** Students ranked by attendance rate (lowest first). */
  async students(tenant: TenantContext, query: AttendanceRankingQueryDto) {
    const period = resolvePeriod(query, tenant.timezone);
    const rows = await this.prisma.$queryRaw<RankedRow[]>`
      ${rankedSelect}
        s.id AS id, s.first_name || ' ' || s.last_name AS name
      FROM attendance a
      JOIN groups g ON g.id = a.group_id
      JOIN enrollments e ON e.id = a.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE ${this.filters(tenant, query, period)}
      GROUP BY s.id, s.first_name, s.last_name
      ${rankedOrder(query)}`;
    return this.page(rows, query, period);
  }

  private filters(
    tenant: TenantContext,
    query: AttendanceRankingQueryDto,
    period: ReportPeriod,
  ): Prisma.Sql {
    return Prisma.sql`a.organization_id = ${tenant.organizationId}::uuid
      AND a.date BETWEEN ${period.fromDate}::date AND ${period.toDate}::date
      ${sqlBranchFilter(tenant, Prisma.sql`a.branch_id`, query.branchId)}
      ${query.groupId ? Prisma.sql`AND a.group_id = ${query.groupId}::uuid` : Prisma.empty}
      ${query.courseId ? Prisma.sql`AND g.course_id = ${query.courseId}::uuid` : Prisma.empty}
      ${query.teacherId ? Prisma.sql`AND g.teacher_id = ${query.teacherId}::uuid` : Prisma.empty}`;
  }

  private page(rows: RankedRow[], query: AttendanceRankingQueryDto, period: ReportPeriod) {
    const items = rows.map(({ rows: _rows, ...row }) => {
      const counts = {
        present: row.present,
        absent: row.absent,
        late: row.late,
        excused: row.excused,
      };
      return { ...row, attendanceRate: attendancePercentage(counts) ?? 0 };
    });
    return { period: periodInfo(period), ...new Paginated(items, rows[0]?.rows ?? 0, query) };
  }
}

/** Per-status counts, lessons (distinct days) and the total row count for pagination. */
const rankedSelect = Prisma.sql`
  SELECT COUNT(*)::int AS total,
         (COUNT(*) FILTER (WHERE a.status = 'PRESENT'))::int AS present,
         (COUNT(*) FILTER (WHERE a.status = 'ABSENT'))::int AS absent,
         (COUNT(*) FILTER (WHERE a.status = 'LATE'))::int AS late,
         (COUNT(*) FILTER (WHERE a.status = 'EXCUSED'))::int AS excused,
         COUNT(DISTINCT a.date)::int AS lessons,
         COUNT(*) OVER ()::int AS rows,`;

const rankedOrder = (query: AttendanceRankingQueryDto): Prisma.Sql => Prisma.sql`
  ORDER BY (COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE')))::numeric / COUNT(*) ASC,
           COUNT(*) DESC, id
  LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`;

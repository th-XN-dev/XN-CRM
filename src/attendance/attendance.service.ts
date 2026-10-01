import { Injectable } from '@nestjs/common';
import { type AttendanceStatus, EnrollmentStatus, type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { parseDateOnly, todayIn } from '../common/utils/dates';
import { PrismaService } from '../database/prisma.service';
import { lockRows } from '../database/row-lock';
import { GroupsService } from '../groups/groups.service';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { StudentsService } from '../students/students.service';
import { TeacherScopeService } from '../teachers/teacher-scope.service';
import { branchOwnedWhere } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { ATTENDED_STATUSES, attendancePercentage, toCounts, totalOf } from './attendance-stats';
import {
  type DateRangeQueryDto,
  type GroupAttendanceQueryDto,
  type MarkGroupAttendanceDto,
  type StudentAttendanceQueryDto,
  type UpdateAttendanceDto,
} from './dto/attendance.dto';

const ATTENDANCE_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  enrollmentId: true,
  groupId: true,
  date: true,
  status: true,
  checkInAt: true,
  note: true,
  markedById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttendanceSelect;

/**
 * Attendance = one mark per enrollment per date. Access is always derived from
 * the group: branch access, plus — for callers holding only `*_own`
 * permissions — being the group's teacher.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly students: StudentsService,
    private readonly scope: TeacherScopeService,
    private readonly events: DomainEventPublisher,
  ) {}

  /** Bulk create-or-update of a group's marks for one date, all-or-nothing. */
  async mark(tenant: TenantContext, groupId: string, dto: MarkGroupAttendanceDto) {
    const group = await this.groups.getReadable(tenant, groupId, PERMISSIONS.ATTENDANCE_MARK);
    const date = parseDateOnly(dto.date);
    this.assertNotFuture(tenant, date);

    const ids = dto.records.map((record) => record.enrollmentId);
    if (new Set(ids).size !== ids.length) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Each enrollment may appear only once',
      );
    }
    dto.records.forEach((record) => assertCheckIn(record.status, record.checkInAt));

    const result = await this.prisma.$transaction(async (tx) => {
      // Serializes concurrent marking of the same group.
      await lockRows(tx, 'groups', [groupId], tenant.organizationId);
      const enrollments = await tx.enrollment.findMany({
        where: { id: { in: ids }, organizationId: tenant.organizationId },
        select: { id: true, groupId: true, status: true, startedAt: true },
      });
      const byId = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
      for (const id of ids) {
        const enrollment = byId.get(id);
        if (!enrollment || enrollment.groupId !== groupId) {
          throw AppException.badRequest(
            ErrorCode.ENROLLMENT_NOT_IN_GROUP,
            `Enrollment ${id} does not belong to this group`,
          );
        }
        if (enrollment.status !== EnrollmentStatus.ACTIVE) {
          throw AppException.conflict(
            ErrorCode.ENROLLMENT_NOT_ACTIVE,
            `Enrollment ${id} is ${enrollment.status}`,
          );
        }
        if (date < enrollment.startedAt) {
          throw AppException.badRequest(
            ErrorCode.ATTENDANCE_DATE_OUT_OF_RANGE,
            `Enrollment ${id} starts after ${dto.date}`,
          );
        }
      }

      const existing = await tx.attendance.count({
        where: { organizationId: tenant.organizationId, enrollmentId: { in: ids }, date },
      });
      const records = [];
      for (const record of dto.records) {
        const values = {
          status: record.status,
          checkInAt: record.checkInAt ? new Date(record.checkInAt) : null,
          note: record.note ?? null,
          markedById: tenant.userId,
        };
        records.push(
          await tx.attendance.upsert({
            where: {
              organizationId_enrollmentId_date: {
                organizationId: tenant.organizationId,
                enrollmentId: record.enrollmentId,
                date,
              },
            },
            create: {
              ...values,
              organizationId: tenant.organizationId,
              branchId: group.branchId,
              enrollmentId: record.enrollmentId,
              groupId,
              date,
            },
            update: values,
            select: ATTENDANCE_SELECT,
          }),
        );
      }
      return { groupId, date, created: records.length - existing, updated: existing, records };
    });

    this.events.publish(tenant, {
      name: DomainEventName.ATTENDANCE_MARKED,
      entityType: 'Group',
      entityId: groupId,
      payload: { date: dto.date, created: result.created, updated: result.updated },
    });
    return result;
  }

  /** Roster for one date: everyone enrolled that day (or already marked), with their mark. */
  async groupRoster(tenant: TenantContext, groupId: string, query: GroupAttendanceQueryDto) {
    const group = await this.groups.getReadable(tenant, groupId, PERMISSIONS.ATTENDANCE_READ);
    const date = query.date ? parseDateOnly(query.date) : todayIn(tenant.timezone);

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        OR: [
          // Enrolled on that date; `endedAt` is exclusive (transfer day belongs to the new group).
          { startedAt: { lte: date }, OR: [{ endedAt: null }, { endedAt: { gt: date } }] },
          { attendance: { some: { date } } },
        ],
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      select: {
        id: true,
        status: true,
        startedAt: true,
        endedAt: true,
        student: { select: { id: true, firstName: true, lastName: true } },
        attendance: {
          where: { date },
          select: { id: true, status: true, checkInAt: true, note: true, markedById: true },
        },
      },
    });

    return {
      group: { id: group.id, name: group.name },
      date,
      teacher: group.teacher,
      room: group.room,
      students: enrollments.map(({ student, attendance, ...enrollment }) => ({
        student,
        enrollment,
        attendance: attendance[0] ?? null,
      })),
    };
  }

  async studentHistory(tenant: TenantContext, studentId: string, query: StudentAttendanceQueryDto) {
    const where: Prisma.AttendanceWhereInput = {
      ...(await this.studentScope(tenant, studentId)),
      date: dateRange(query),
      status: query.status,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        ...pageArgs(query),
        select: { ...ATTENDANCE_SELECT, group: { select: { id: true, name: true } } },
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  async studentStatistics(tenant: TenantContext, studentId: string, range: DateRangeQueryDto) {
    const where = { ...(await this.studentScope(tenant, studentId)), date: dateRange(range) };
    const counts = toCounts(await this.countByStatus(where));
    return {
      studentId,
      from: range.from ?? null,
      to: range.to ?? null,
      totalLessons: totalOf(counts),
      ...counts,
      attendancePercentage: attendancePercentage(counts),
    };
  }

  async groupStatistics(tenant: TenantContext, groupId: string, range: DateRangeQueryDto) {
    await this.groups.getReadable(tenant, groupId, PERMISSIONS.ATTENDANCE_READ);
    const where: Prisma.AttendanceWhereInput = {
      organizationId: tenant.organizationId,
      groupId,
      date: dateRange(range),
    };
    const [byStatus, lessons] = await Promise.all([
      this.countByStatus(where),
      this.prisma.attendance.groupBy({ by: ['date'], where, orderBy: { date: 'asc' } }),
    ]);
    const counts = toCounts(byStatus);
    return {
      groupId,
      from: range.from ?? null,
      to: range.to ?? null,
      lessonsCount: lessons.length,
      totalAttendance: totalOf(counts),
      ...counts,
      averageAttendance: attendancePercentage(counts),
    };
  }

  async update(tenant: TenantContext, id: string, dto: UpdateAttendanceDto) {
    const current = await this.getInOrganization(tenant, id);
    await this.groups.getReadable(tenant, current.groupId, PERMISSIONS.ATTENDANCE_MARK);

    const status = dto.status ?? current.status;
    // A check-in time only makes sense when the student came; drop it otherwise.
    const checkInAt =
      dto.checkInAt !== undefined
        ? dto.checkInAt && new Date(dto.checkInAt)
        : ATTENDED_STATUSES.includes(status)
          ? current.checkInAt
          : null;
    assertCheckIn(status, checkInAt);

    const record = await this.prisma.attendance.update({
      where: { id, organizationId: tenant.organizationId },
      data: { status, checkInAt, note: dto.note, markedById: tenant.userId },
      select: ATTENDANCE_SELECT,
    });
    this.events.publish(tenant, {
      name: DomainEventName.ATTENDANCE_UPDATED,
      entityType: 'Attendance',
      entityId: id,
      payload: { from: current.status, to: record.status },
    });
    return record;
  }

  /** Removes a mark entirely (e.g. a lesson that did not happen). */
  async remove(tenant: TenantContext, id: string) {
    const current = await this.getInOrganization(tenant, id);
    await this.groups.getAccessible(tenant, current.groupId);
    await this.prisma.attendance.delete({ where: { id, organizationId: tenant.organizationId } });
    this.events.publish(tenant, {
      name: DomainEventName.ATTENDANCE_DELETED,
      entityType: 'Attendance',
      entityId: id,
      payload: { groupId: current.groupId, enrollmentId: current.enrollmentId, date: current.date },
    });
    return current;
  }

  // ─── internals ──────────────────────────────────────────────────────────────

  private async getInOrganization(tenant: TenantContext, id: string) {
    const record = await this.prisma.attendance.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: ATTENDANCE_SELECT,
    });
    if (!record)
      throw AppException.notFound(ErrorCode.ATTENDANCE_NOT_FOUND, 'Attendance not found');
    return record;
  }

  /**
   * Which of a student's marks the caller may see:
   * `attendance.read` → marks in the caller's branches;
   * `attendance.read_own` → marks in groups the caller teaches (403 if none ever).
   */
  private async studentScope(
    tenant: TenantContext,
    studentId: string,
  ): Promise<Prisma.AttendanceWhereInput> {
    const base = { enrollment: { studentId } };
    const restriction = await this.scope.restriction(tenant, PERMISSIONS.ATTENDANCE_READ);
    if (!restriction) {
      await this.students.getAccessible(tenant, studentId);
      return { ...branchOwnedWhere(tenant), ...base };
    }

    const taught = restriction.teacherId
      ? await this.prisma.enrollment.count({
          where: {
            studentId,
            organizationId: tenant.organizationId,
            group: { teacherId: restriction.teacherId },
          },
        })
      : 0;
    if (!taught) {
      throw AppException.forbidden(
        ErrorCode.GROUP_ACCESS_DENIED,
        'You can only access attendance of students you teach',
      );
    }
    return {
      organizationId: tenant.organizationId,
      group: { teacherId: restriction.teacherId! },
      ...base,
    };
  }

  private countByStatus(where: Prisma.AttendanceWhereInput) {
    return this.prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } });
  }

  private assertNotFuture(tenant: TenantContext, date: Date): void {
    if (
      date > todayIn(tenant.timezone) &&
      !tenant.permissions.has(PERMISSIONS.ATTENDANCE_MARK_FUTURE)
    ) {
      throw AppException.forbidden(
        ErrorCode.ATTENDANCE_FUTURE_DATE,
        'Marking attendance for a future date requires attendance.mark_future',
      );
    }
  }
}

function assertCheckIn(
  status: AttendanceStatus,
  checkInAt: string | Date | null | undefined,
): void {
  if (checkInAt && !ATTENDED_STATUSES.includes(status)) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_ERROR,
      'checkInAt is only allowed for PRESENT or LATE',
    );
  }
}

function dateRange(range: { from?: string; to?: string }): Prisma.DateTimeFilter | undefined {
  if (!range.from && !range.to) return undefined;
  if (range.from && range.to && range.from > range.to) {
    throw AppException.badRequest(ErrorCode.INVALID_DATE_RANGE, '`from` must not be after `to`');
  }
  return {
    ...(range.from && { gte: parseDateOnly(range.from) }),
    ...(range.to && { lte: parseDateOnly(range.to) }),
  };
}

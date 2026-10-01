import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, GroupStatus, type Prisma, StudentStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { type PaginationQueryDto, pageArgs } from '../common/pagination/pagination-query.dto';
import { icontains, searchWhere } from '../common/pagination/search';
import { parseDateOnly, todayIn } from '../common/utils/dates';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { lockRows } from '../database/row-lock';
import { countActiveEnrollments } from '../groups/group.access';
import { assertBranchAccess, branchListFilter, branchOwnedWhere } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  type CancelEnrollmentDto,
  type CreateEnrollmentDto,
  type ListEnrollmentsQueryDto,
  type TransferEnrollmentDto,
  type UpdateEnrollmentDto,
} from './dto/enrollment.dto';

const ENROLLMENT_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  studentId: true,
  groupId: true,
  startedAt: true,
  endedAt: true,
  status: true,
  notes: true,
  transferredFromId: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  group: {
    select: {
      id: true,
      name: true,
      branch: { select: { id: true, name: true } },
      course: { select: { id: true, name: true } },
      level: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.EnrollmentSelect;

type Tx = Prisma.TransactionClient;

/**
 * Enrollment lifecycle. Every mutation runs in a transaction that first locks
 * the student row, then the target group row (fixed order → no deadlocks), so
 * "one ACTIVE enrollment per student" and "capacity" hold under concurrency.
 * Rows are never deleted — history is the point.
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
  ) {}

  async create(tenant: TenantContext, dto: CreateEnrollmentDto) {
    const startedAt = dto.startedAt ? parseDateOnly(dto.startedAt) : todayIn(tenant.timezone);
    const enrollment = await this.inTransaction((tx) =>
      this.enrollWithinTx(tx, tenant, {
        studentId: dto.studentId,
        groupId: dto.groupId,
        startedAt,
        notes: dto.notes,
      }),
    );

    this.events.publish(tenant, {
      name: DomainEventName.ENROLLMENT_CREATED,
      entityType: 'Enrollment',
      entityId: enrollment.id,
      payload: { studentId: enrollment.studentId, groupId: enrollment.groupId },
    });
    return enrollment;
  }

  /**
   * Enrolls a student into a group inside a caller-supplied transaction, with the
   * same locks and invariants as {@link create} but without emitting the event
   * (the caller owns the commit and any events). Used by lead conversion so the
   * family + student + enrollment all land in one transaction.
   */
  async enrollWithinTx(
    tx: Tx,
    tenant: TenantContext,
    params: { studentId: string; groupId: string; startedAt: Date; notes?: string },
  ) {
    const student = await this.lockStudent(tx, tenant, params.studentId);
    if (student.status !== StudentStatus.ACTIVE) {
      throw AppException.conflict(ErrorCode.STUDENT_NOT_ACTIVE, `Student is ${student.status}`);
    }
    await this.assertNoActiveEnrollment(tx, student.id);
    const group = await this.lockAdmittingGroup(tx, tenant, params.groupId);

    const created = await tx.enrollment.create({
      data: {
        organizationId: tenant.organizationId,
        branchId: group.branchId,
        studentId: student.id,
        groupId: group.id,
        startedAt: params.startedAt,
        notes: params.notes,
      },
      select: ENROLLMENT_SELECT,
    });
    await this.followGroupBranch(tx, student, group.branchId);
    return created;
  }

  async list(tenant: TenantContext, query: ListEnrollmentsQueryDto) {
    const where: Prisma.EnrollmentWhereInput = {
      AND: [
        branchOwnedWhere(tenant),
        {
          branchId: branchListFilter(tenant, query.branchId),
          status: query.status,
          studentId: query.studentId,
          groupId: query.groupId,
          ...((query.courseId || query.levelId) && {
            group: { courseId: query.courseId, levelId: query.levelId },
          }),
        },
        searchWhere<Prisma.EnrollmentWhereInput>(query.search, (term) => [
          { student: { firstName: icontains(term) } },
          { student: { lastName: icontains(term) } },
          { group: { name: icontains(term) } },
        ]) ?? {},
      ],
    };
    return this.paginate(
      where,
      [{ [query.sortBy]: query.sortOrder }, { createdAt: 'desc' }],
      query,
    );
  }

  /**
   * Full history of one student (newest first). Branch-restricted callers see
   * the part of the history that happened in their branches.
   */
  listForStudent(tenant: TenantContext, studentId: string, query: PaginationQueryDto) {
    return this.paginate(
      { ...branchOwnedWhere(tenant), studentId },
      [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      query,
    );
  }

  async findOne(tenant: TenantContext, id: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: ENROLLMENT_SELECT,
    });
    if (!enrollment) throw notFound();
    assertBranchAccess(tenant, enrollment.branchId);
    return enrollment;
  }

  async update(tenant: TenantContext, id: string, dto: UpdateEnrollmentDto) {
    await this.findOne(tenant, id);
    return this.prisma.enrollment.update({
      where: { id, organizationId: tenant.organizationId },
      data: { notes: dto.notes },
      select: ENROLLMENT_SELECT,
    });
  }

  /** Closes the current enrollment as TRANSFERRED and opens a new ACTIVE one — atomically. */
  async transfer(tenant: TenantContext, id: string, dto: TransferEnrollmentDto) {
    const source = await this.findOne(tenant, id);
    assertActive(source.status);
    if (dto.targetGroupId === source.groupId) {
      throw AppException.badRequest(
        ErrorCode.TRANSFER_SAME_GROUP,
        'Student is already in this group',
      );
    }
    const transferDate = dto.transferDate
      ? parseDateOnly(dto.transferDate)
      : todayIn(tenant.timezone);

    const result = await this.inTransaction(async (tx) => {
      const student = await this.lockStudent(tx, tenant, source.studentId);
      const current = await this.reloadActive(tx, id);
      if (transferDate < current.startedAt) {
        throw AppException.badRequest(
          ErrorCode.INVALID_DATE_RANGE,
          'transferDate must not be before the enrollment start date',
        );
      }
      const target = await this.lockAdmittingGroup(tx, tenant, dto.targetGroupId);

      const previous = await tx.enrollment.update({
        where: { id },
        data: { status: EnrollmentStatus.TRANSFERRED, endedAt: transferDate },
        select: ENROLLMENT_SELECT,
      });
      const next = await tx.enrollment.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: target.branchId,
          studentId: student.id,
          groupId: target.id,
          startedAt: transferDate,
          notes: dto.notes,
          transferredFromId: id,
        },
        select: ENROLLMENT_SELECT,
      });
      await this.followGroupBranch(tx, student, target.branchId);
      return { previous, current: next };
    });

    this.events.publish(tenant, {
      name: DomainEventName.ENROLLMENT_TRANSFERRED,
      entityType: 'Enrollment',
      entityId: result.current.id,
      payload: {
        studentId: result.current.studentId,
        fromEnrollmentId: result.previous.id,
        fromGroupId: result.previous.groupId,
        toGroupId: result.current.groupId,
      },
    });
    return result;
  }

  async cancel(tenant: TenantContext, id: string, dto: CancelEnrollmentDto) {
    const source = await this.findOne(tenant, id);
    assertActive(source.status);
    const endedAt = dto.endedAt ? parseDateOnly(dto.endedAt) : todayIn(tenant.timezone);

    const enrollment = await this.inTransaction(async (tx) => {
      await this.lockStudent(tx, tenant, source.studentId);
      const current = await this.reloadActive(tx, id);
      if (endedAt < current.startedAt) {
        throw AppException.badRequest(
          ErrorCode.INVALID_DATE_RANGE,
          'endedAt must not be before startedAt',
        );
      }
      return tx.enrollment.update({
        where: { id },
        data: { status: EnrollmentStatus.CANCELLED, endedAt, notes: dto.notes },
        select: ENROLLMENT_SELECT,
      });
    });

    this.events.publish(tenant, {
      name: DomainEventName.ENROLLMENT_CANCELLED,
      entityType: 'Enrollment',
      entityId: id,
      payload: { studentId: enrollment.studentId, groupId: enrollment.groupId },
    });
    return enrollment;
  }

  // ─── internals ──────────────────────────────────────────────────────────────

  private async inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      // Backstop: the partial unique index "one ACTIVE enrollment per student".
      if (isUniqueViolation(error)) throw alreadyEnrolled();
      throw error;
    }
  }

  private async lockStudent(tx: Tx, tenant: TenantContext, studentId: string) {
    const [locked] = await lockRows(tx, 'students', [studentId], tenant.organizationId);
    if (!locked) throw AppException.notFound(ErrorCode.STUDENT_NOT_FOUND, 'Student not found');
    const student = await tx.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { id: true, branchId: true, status: true },
    });
    assertBranchAccess(tenant, student.branchId);
    return student;
  }

  /** Locks the group and verifies it can take one more ACTIVE enrollment. */
  private async lockAdmittingGroup(tx: Tx, tenant: TenantContext, groupId: string) {
    const [locked] = await lockRows(tx, 'groups', [groupId], tenant.organizationId);
    if (!locked) throw AppException.notFound(ErrorCode.GROUP_NOT_FOUND, 'Group not found');
    const group = await tx.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { id: true, branchId: true, status: true, capacity: true },
    });
    assertBranchAccess(tenant, group.branchId);
    if (group.status !== GroupStatus.ACTIVE) {
      throw AppException.conflict(ErrorCode.GROUP_NOT_ACTIVE, `Group is ${group.status}`);
    }
    // Waitlist hook: instead of rejecting, a WAITLISTED enrollment could be created here.
    if ((await countActiveEnrollments(tx, group.id)) >= group.capacity) {
      throw AppException.conflict(ErrorCode.GROUP_CAPACITY_FULL, 'Group capacity is full');
    }
    return group;
  }

  private async assertNoActiveEnrollment(tx: Tx, studentId: string): Promise<void> {
    const active = await tx.enrollment.count({
      where: { studentId, status: EnrollmentStatus.ACTIVE },
    });
    if (active > 0) throw alreadyEnrolled();
  }

  /** Re-reads the enrollment after the student lock; it must still be ACTIVE. */
  private async reloadActive(tx: Tx, id: string) {
    const current = await tx.enrollment.findUniqueOrThrow({
      where: { id },
      select: { status: true, startedAt: true },
    });
    if (current.status !== EnrollmentStatus.ACTIVE) {
      throw AppException.conflict(
        ErrorCode.ENROLLMENT_NOT_ACTIVE,
        `Enrollment is ${current.status}`,
      );
    }
    return current;
  }

  /** The student's home branch follows the group they study in. */
  private async followGroupBranch(
    tx: Tx,
    student: { id: string; branchId: string },
    branchId: string,
  ) {
    if (student.branchId !== branchId) {
      await tx.student.update({ where: { id: student.id }, data: { branchId } });
    }
  }

  private async paginate(
    where: Prisma.EnrollmentWhereInput,
    orderBy: Prisma.EnrollmentOrderByWithRelationInput[],
    query: PaginationQueryDto,
  ) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        orderBy,
        ...pageArgs(query),
        select: ENROLLMENT_SELECT,
      }),
      this.prisma.enrollment.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }
}

/** Fast pre-check outside the transaction; repeated under the student lock. */
function assertActive(status: EnrollmentStatus): void {
  if (status !== EnrollmentStatus.ACTIVE) {
    throw AppException.conflict(ErrorCode.ENROLLMENT_NOT_ACTIVE, `Enrollment is ${status}`);
  }
}

const notFound = (): AppException =>
  AppException.notFound(ErrorCode.ENROLLMENT_NOT_FOUND, 'Enrollment not found');

const alreadyEnrolled = (): AppException =>
  AppException.conflict(
    ErrorCode.STUDENT_ALREADY_ENROLLED,
    'Student already has an active enrollment',
  );

import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, type Prisma, StudentStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { icontains, phoneContains, searchWhere } from '../common/pagination/search';
import { parseDateOnly, todayIn } from '../common/utils/dates';
import { PrismaService } from '../database/prisma.service';
import { lockRows } from '../database/row-lock';
import { FamiliesService } from '../families/families.service';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { TeacherScopeService } from '../teachers/teacher-scope.service';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { assertBranchAccess, branchListFilter } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { type CreateStudentDto } from './dto/create-student.dto';
import { type ListStudentsQueryDto } from './dto/list-students-query.dto';
import { type UpdateStudentDto } from './dto/update-student.dto';
import { studentAccessWhere } from './student.access';
import { canTransition, ENROLLMENT_CLOSURE } from './student-status';

const STUDENT_SELECT = {
  id: true,
  organizationId: true,
  familyId: true,
  branchId: true,
  firstName: true,
  lastName: true,
  middleName: true,
  birthDate: true,
  gender: true,
  phone: true,
  status: true,
  joinedAt: true,
  leftAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StudentSelect;

const STUDENT_LIST_SELECT = {
  ...STUDENT_SELECT,
  family: { select: { id: true, name: true, phone: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.StudentSelect;

type StudentRecord = Prisma.StudentGetPayload<{ select: typeof STUDENT_SELECT }>;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
    private readonly branches: BranchAccessService,
    private readonly scope: TeacherScopeService,
    private readonly events: DomainEventPublisher,
  ) {}

  /** Creates a student for an existing family, or a new family + student atomically. */
  async create(tenant: TenantContext, dto: CreateStudentDto) {
    const {
      familyId,
      family: newFamily,
      branchId: requestedBranch,
      joinedAt,
      birthDate,
      ...profile
    } = dto;
    if (familyId && newFamily) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Send either familyId or family, not both',
      );
    }

    const existingFamily = familyId ? await this.families.getAccessible(tenant, familyId) : null;
    if (existingFamily && !existingFamily.isActive) {
      throw AppException.conflict(ErrorCode.FAMILY_INACTIVE, 'Family is inactive');
    }
    const branchId = await this.branches.resolveWritableBranch(
      tenant,
      requestedBranch,
      existingFamily?.primaryBranchId ?? newFamily?.primaryBranchId,
    );
    const familyData = newFamily
      ? await this.families.prepareCreate(tenant, newFamily, branchId)
      : null;

    const { student, createdFamily } = await this.prisma.$transaction(async (tx) => {
      const createdFamily = familyData
        ? await tx.family.create({ data: familyData, select: { id: true, name: true } })
        : null;
      const student = await tx.student.create({
        data: {
          ...profile,
          organizationId: tenant.organizationId,
          familyId: createdFamily?.id ?? familyId!,
          branchId,
          birthDate: birthDate ? parseDateOnly(birthDate) : undefined,
          joinedAt: joinedAt ? parseDateOnly(joinedAt) : todayIn(tenant.timezone),
        },
        select: STUDENT_SELECT,
      });
      return { student, createdFamily };
    });

    if (createdFamily) this.families.publishCreated(tenant, createdFamily);
    this.events.publish(tenant, {
      name: DomainEventName.STUDENT_CREATED,
      entityType: 'Student',
      entityId: student.id,
      payload: { familyId: student.familyId, branchId: student.branchId },
    });
    return student;
  }

  async list(tenant: TenantContext, query: ListStudentsQueryDto) {
    const inActiveGroup: Prisma.GroupWhereInput = {
      id: query.groupId,
      courseId: query.courseId,
      levelId: query.levelId,
    };
    const byGroup = query.groupId || query.courseId || query.levelId;
    const where: Prisma.StudentWhereInput = {
      AND: [
        studentAccessWhere(tenant),
        await this.ownStudentsWhere(tenant),
        {
          branchId: branchListFilter(tenant, query.branchId),
          status: query.status,
          familyId: query.familyId,
          ...(byGroup && {
            enrollments: { some: { status: EnrollmentStatus.ACTIVE, group: inActiveGroup } },
          }),
        },
        searchWhere<Prisma.StudentWhereInput>(query.search, (term) => [
          { firstName: icontains(term) },
          { lastName: icontains(term) },
          { middleName: icontains(term) },
          { phone: phoneContains(term) },
          { family: { phone: phoneContains(term) } },
        ]) ?? {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: STUDENT_LIST_SELECT,
      }),
      this.prisma.student.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  async findOne(tenant: TenantContext, id: string) {
    await this.getReadable(tenant, id);
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id },
      select: {
        ...STUDENT_LIST_SELECT,
        enrollments: {
          where: { status: EnrollmentStatus.ACTIVE },
          take: 1,
          select: { id: true, startedAt: true, group: { select: { id: true, name: true } } },
        },
      },
    });
    const { enrollments, ...rest } = student;
    return { ...rest, activeEnrollment: enrollments[0] ?? null };
  }

  async update(tenant: TenantContext, id: string, dto: UpdateStudentDto): Promise<StudentRecord> {
    const current = await this.getAccessible(tenant, id);
    const { status, familyId, branchId, birthDate, ...profile } = dto;

    if (familyId && familyId !== current.familyId) {
      const family = await this.families.getAccessible(tenant, familyId);
      if (!family.isActive)
        throw AppException.conflict(ErrorCode.FAMILY_INACTIVE, 'Family is inactive');
    }
    if (branchId && branchId !== current.branchId) {
      await this.branches.assertWritableBranch(tenant, branchId);
    }
    if (status && status !== current.status && !canTransition(current.status, status)) {
      throw AppException.badRequest(
        ErrorCode.INVALID_STATUS_TRANSITION,
        `Cannot change student status from ${current.status} to ${status}`,
      );
    }
    const statusChanged = status !== undefined && status !== current.status;

    const { student, closedEnrollmentId } = await this.prisma.$transaction(async (tx) => {
      // Serializes with enrollment create/transfer/cancel for this student.
      await lockRows(tx, 'students', [id], tenant.organizationId);
      const active = await tx.enrollment.findFirst({
        where: { studentId: id, status: EnrollmentStatus.ACTIVE },
        select: { id: true, startedAt: true },
      });
      if (branchId && branchId !== current.branchId && active) {
        throw AppException.conflict(
          ErrorCode.STUDENT_HAS_ACTIVE_ENROLLMENT,
          'Student has an active enrollment; transfer it to a group of the new branch instead',
        );
      }

      const today = todayIn(tenant.timezone);
      let closedEnrollmentId: string | null = null;
      const closeAs = statusChanged ? ENROLLMENT_CLOSURE[status] : undefined;
      if (closeAs && active) {
        await tx.enrollment.update({
          where: { id: active.id },
          data: { status: closeAs, endedAt: maxDate(today, active.startedAt) },
        });
        closedEnrollmentId = active.id;
      }

      const student = await tx.student.update({
        where: { id, organizationId: tenant.organizationId },
        data: {
          ...profile,
          familyId,
          branchId,
          birthDate:
            birthDate === undefined ? undefined : birthDate ? parseDateOnly(birthDate) : null,
          ...(statusChanged && {
            status,
            leftAt:
              status === StudentStatus.ACTIVE || status === StudentStatus.FROZEN ? null : today,
          }),
        },
        select: STUDENT_SELECT,
      });
      return { student, closedEnrollmentId };
    });

    this.events.publish(tenant, {
      name: DomainEventName.STUDENT_UPDATED,
      entityType: 'Student',
      entityId: id,
      payload: { fields: Object.keys(dto).filter((key) => key !== 'status') },
    });
    if (statusChanged) {
      this.events.publish(tenant, {
        name: DomainEventName.STUDENT_STATUS_CHANGED,
        entityType: 'Student',
        entityId: id,
        payload: { from: current.status, to: status, closedEnrollmentId },
      });
    }
    return student;
  }

  /** Soft delete: marks the student as LEFT (history is kept). */
  remove(tenant: TenantContext, id: string): Promise<StudentRecord> {
    return this.update(tenant, id, { status: StudentStatus.LEFT });
  }

  /**
   * Read access: `students.read` → any student of the caller's branches;
   * `students.read_own` → only students actively enrolled in groups the caller teaches.
   */
  async getReadable(tenant: TenantContext, id: string): Promise<StudentRecord> {
    const student = await this.getAccessible(tenant, id);
    const own = await this.ownStudentsWhere(tenant);
    if (Object.keys(own).length && !(await this.prisma.student.count({ where: { id, ...own } }))) {
      throw AppException.forbidden(
        ErrorCode.GROUP_ACCESS_DENIED,
        'You can only access students of groups you teach',
      );
    }
    return student;
  }

  private async ownStudentsWhere(tenant: TenantContext): Promise<Prisma.StudentWhereInput> {
    const groupWhere = await this.scope.groupWhere(tenant, PERMISSIONS.STUDENTS_READ);
    if (!Object.keys(groupWhere).length) return {};
    return { enrollments: { some: { status: EnrollmentStatus.ACTIVE, group: groupWhere } } };
  }

  /** 404 when outside the organization, 403 when outside the caller's branches. */
  async getAccessible(tenant: TenantContext, id: string): Promise<StudentRecord> {
    const student = await this.prisma.student.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: STUDENT_SELECT,
    });
    if (!student) throw AppException.notFound(ErrorCode.STUDENT_NOT_FOUND, 'Student not found');
    assertBranchAccess(tenant, student.branchId);
    return student;
  }
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

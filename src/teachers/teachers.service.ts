import { Injectable } from '@nestjs/common';
import { MembershipStatus, type Prisma, TeacherStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { icontains, phoneContains, searchWhere } from '../common/pagination/search';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { RUNNING_GROUP_STATUSES } from '../courses/courses.service';
import { PrismaService } from '../database/prisma.service';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { assertBranchAccess, branchListFilter, branchOwnedWhere } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  type CreateTeacherDto,
  type ListTeachersQueryDto,
  type UpdateTeacherDto,
} from './dto/teacher.dto';

const TEACHER_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  userId: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true } },
} satisfies Prisma.TeacherSelect;

type TeacherRecord = Prisma.TeacherGetPayload<{ select: typeof TEACHER_SELECT }>;

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly events: DomainEventPublisher,
  ) {}

  async create(tenant: TenantContext, dto: CreateTeacherDto): Promise<TeacherRecord> {
    const { branchId: requested, userId, ...profile } = dto;
    const branchId = await this.branches.resolveWritableBranch(tenant, requested);
    if (userId) await this.assertMember(tenant, userId);

    const teacher = await this.save(() =>
      this.prisma.teacher.create({
        data: { ...profile, userId, branchId, organizationId: tenant.organizationId },
        select: TEACHER_SELECT,
      }),
    );
    this.events.publish(tenant, {
      name: DomainEventName.TEACHER_CREATED,
      entityType: 'Teacher',
      entityId: teacher.id,
      payload: { branchId, linkedUser: Boolean(userId) },
    });
    return teacher;
  }

  async list(tenant: TenantContext, query: ListTeachersQueryDto) {
    const where: Prisma.TeacherWhereInput = {
      AND: [
        branchOwnedWhere(tenant),
        { branchId: branchListFilter(tenant, query.branchId), status: query.status },
        searchWhere<Prisma.TeacherWhereInput>(query.search, (term) => [
          { firstName: icontains(term) },
          { lastName: icontains(term) },
          { phone: phoneContains(term) },
        ]) ?? {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.teacher.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: TEACHER_SELECT,
      }),
      this.prisma.teacher.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  async findOne(tenant: TenantContext, id: string) {
    const teacher = await this.getAccessible(tenant, id);
    const groups = await this.prisma.group.findMany({
      where: { teacherId: id, status: { in: RUNNING_GROUP_STATUSES } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, status: true, branchId: true },
    });
    return { ...teacher, groups };
  }

  async update(tenant: TenantContext, id: string, dto: UpdateTeacherDto): Promise<TeacherRecord> {
    const current = await this.getAccessible(tenant, id);
    const { branchId, userId, status, ...profile } = dto;
    if (branchId && branchId !== current.branchId) {
      await this.branches.assertWritableBranch(tenant, branchId);
    }
    if (userId && userId !== current.userId) await this.assertMember(tenant, userId);
    if (status === TeacherStatus.INACTIVE && current.status !== TeacherStatus.INACTIVE) {
      await this.assertNoRunningGroups(id);
    }
    return this.save(() =>
      this.prisma.teacher.update({
        where: { id, organizationId: tenant.organizationId },
        data: { ...profile, branchId, userId, status },
        select: TEACHER_SELECT,
      }),
    );
  }

  /** Soft delete: the teacher becomes INACTIVE. */
  deactivate(tenant: TenantContext, id: string): Promise<TeacherRecord> {
    return this.update(tenant, id, { status: TeacherStatus.INACTIVE });
  }

  /** 404 outside the organization, 403 outside the caller's branches. */
  async getAccessible(tenant: TenantContext, id: string): Promise<TeacherRecord> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: TEACHER_SELECT,
    });
    if (!teacher) throw AppException.notFound(ErrorCode.TEACHER_NOT_FOUND, 'Teacher not found');
    assertBranchAccess(tenant, teacher.branchId);
    return teacher;
  }

  /** A teacher that may be put in charge of a group: same organization, reachable branch, ACTIVE. */
  async getAssignable(tenant: TenantContext, id: string): Promise<TeacherRecord> {
    const teacher = await this.getAccessible(tenant, id);
    if (teacher.status !== TeacherStatus.ACTIVE) {
      throw AppException.conflict(ErrorCode.TEACHER_INACTIVE, 'Teacher is inactive');
    }
    return teacher;
  }

  private async assertMember(tenant: TenantContext, userId: string): Promise<void> {
    const member = await this.prisma.organizationMembership.count({
      where: { userId, organizationId: tenant.organizationId, status: MembershipStatus.ACTIVE },
    });
    if (!member) {
      throw AppException.badRequest(
        ErrorCode.TEACHER_USER_NOT_MEMBER,
        'userId must belong to an active member of the organization',
      );
    }
  }

  private async assertNoRunningGroups(teacherId: string): Promise<void> {
    const running = await this.prisma.group.count({
      where: { teacherId, status: { in: RUNNING_GROUP_STATUSES } },
    });
    if (running > 0) {
      throw AppException.conflict(
        ErrorCode.TEACHER_HAS_ACTIVE_GROUPS,
        'Teacher still leads active or paused groups; reassign them first',
      );
    }
  }

  private async save<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.TEACHER_USER_TAKEN,
          'This user is already linked to another teacher profile',
        );
      }
      throw error;
    }
  }
}

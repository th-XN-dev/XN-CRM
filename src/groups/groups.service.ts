import { Injectable } from '@nestjs/common';
import { GroupStatus, type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { icontains, searchWhere } from '../common/pagination/search';
import { parseDateOnly } from '../common/utils/dates';
import { CoursesService } from '../courses/courses.service';
import { LevelsService } from '../courses/levels.service';
import { PrismaService } from '../database/prisma.service';
import { lockRows } from '../database/row-lock';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { RoomsService } from '../rooms/rooms.service';
import { assertNoScheduleConflicts } from '../schedules/schedule-conflicts';
import { TeacherScopeService } from '../teachers/teacher-scope.service';
import { TeachersService } from '../teachers/teachers.service';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { assertBranchAccess, branchListFilter, branchOwnedWhere } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { type CreateGroupDto, type ListGroupsQueryDto, type UpdateGroupDto } from './dto/group.dto';
import { countActiveEnrollments, GROUP_SELECT, toGroupResponse } from './group.access';

const CLOSED_STATUSES: GroupStatus[] = [GroupStatus.COMPLETED, GroupStatus.CANCELLED];

type GroupRow = Prisma.GroupGetPayload<{ select: typeof GROUP_SELECT }>;

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly courses: CoursesService,
    private readonly levels: LevelsService,
    private readonly teachers: TeachersService,
    private readonly rooms: RoomsService,
    private readonly scope: TeacherScopeService,
    private readonly events: DomainEventPublisher,
  ) {}

  async create(tenant: TenantContext, dto: CreateGroupDto) {
    const branchId = await this.branches.resolveWritableBranch(tenant, dto.branchId);
    const course = await this.courses.getInOrganization(tenant, dto.courseId);
    if (!course.isActive)
      throw AppException.conflict(ErrorCode.COURSE_INACTIVE, 'Course is inactive');
    if (dto.levelId) await this.assertLevelOfCourse(tenant, dto.levelId, course.id);
    if (dto.teacherId) await this.teachers.getAssignable(tenant, dto.teacherId);
    if (dto.roomId) await this.rooms.getAssignable(tenant, dto.roomId, branchId);

    const startDate = parseDateOnly(dto.startDate);
    const endDate = dto.endDate ? parseDateOnly(dto.endDate) : null;
    assertDateOrder(startDate, endDate);

    // A new group has no schedule yet, so assignment can't clash with anything.
    const group = await this.prisma.group.create({
      data: {
        organizationId: tenant.organizationId,
        branchId,
        courseId: course.id,
        levelId: dto.levelId,
        teacherId: dto.teacherId,
        roomId: dto.roomId,
        name: dto.name,
        capacity: dto.capacity,
        monthlyPrice: dto.monthlyPrice ?? course.monthlyPrice,
        startDate,
        endDate,
      },
      select: GROUP_SELECT,
    });
    this.events.publish(tenant, {
      name: DomainEventName.GROUP_CREATED,
      entityType: 'Group',
      entityId: group.id,
      payload: {
        branchId,
        courseId: course.id,
        levelId: dto.levelId ?? null,
        teacherId: dto.teacherId ?? null,
      },
    });
    return toGroupResponse(group);
  }

  /** Full `groups.read` → every group of the caller's branches; `groups.read_own` → groups they teach. */
  async list(tenant: TenantContext, query: ListGroupsQueryDto) {
    const where: Prisma.GroupWhereInput = {
      AND: [
        branchOwnedWhere(tenant),
        await this.scope.groupWhere(tenant, PERMISSIONS.GROUPS_READ),
        {
          branchId: branchListFilter(tenant, query.branchId),
          status: query.status,
          courseId: query.courseId,
          levelId: query.levelId,
        },
        searchWhere<Prisma.GroupWhereInput>(query.search, (term) => [{ name: icontains(term) }]) ??
          {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: GROUP_SELECT,
      }),
      this.prisma.group.count({ where }),
    ]);
    return new Paginated(items.map(toGroupResponse), total, query);
  }

  async findOne(tenant: TenantContext, id: string) {
    return toGroupResponse(await this.getReadable(tenant, id, PERMISSIONS.GROUPS_READ));
  }

  async update(tenant: TenantContext, id: string, dto: UpdateGroupDto) {
    const current = await this.getAccessible(tenant, id);
    if (dto.levelId) await this.assertLevelOfCourse(tenant, dto.levelId, current.courseId);
    const teacherChanged = dto.teacherId !== undefined && dto.teacherId !== current.teacherId;
    const roomChanged = dto.roomId !== undefined && dto.roomId !== current.roomId;
    if (teacherChanged && dto.teacherId) await this.teachers.getAssignable(tenant, dto.teacherId);
    if (roomChanged && dto.roomId)
      await this.rooms.getAssignable(tenant, dto.roomId, current.branchId);

    const startDate = dto.startDate ? parseDateOnly(dto.startDate) : current.startDate;
    const endDate =
      dto.endDate === undefined ? current.endDate : dto.endDate ? parseDateOnly(dto.endDate) : null;
    assertDateOrder(startDate, endDate);

    const group = await this.prisma.$transaction(async (tx) => {
      // Locked so capacity/status/assignment checks can't race with enrollments or schedules.
      await lockRows(tx, 'groups', [id], tenant.organizationId);
      const enrolled = await countActiveEnrollments(tx, id);
      if (dto.capacity !== undefined && dto.capacity < enrolled) {
        throw AppException.conflict(
          ErrorCode.GROUP_CAPACITY_BELOW_ENROLLED,
          `Capacity cannot be lower than the ${enrolled} active enrollments`,
        );
      }
      if (dto.status && CLOSED_STATUSES.includes(dto.status) && enrolled > 0) {
        throw hasActiveEnrollments();
      }
      if (teacherChanged && dto.teacherId) {
        await this.assertTeacherFree(tx, tenant, {
          id,
          startDate,
          endDate,
          teacherId: dto.teacherId,
        });
      }
      return tx.group.update({
        where: { id, organizationId: tenant.organizationId },
        data: { ...dto, startDate, endDate },
        select: GROUP_SELECT,
      });
    });

    if (teacherChanged) {
      this.events.publish(tenant, {
        name: DomainEventName.GROUP_TEACHER_ASSIGNED,
        entityType: 'Group',
        entityId: id,
        payload: { from: current.teacherId, to: group.teacherId },
      });
    }
    if (roomChanged) {
      this.events.publish(tenant, {
        name: DomainEventName.GROUP_ROOM_ASSIGNED,
        entityType: 'Group',
        entityId: id,
        payload: { from: current.roomId, to: group.roomId },
      });
    }
    return toGroupResponse(group);
  }

  /** Soft delete: the group becomes CANCELLED; enrollment history stays. */
  cancel(tenant: TenantContext, id: string) {
    return this.update(tenant, id, { status: GroupStatus.CANCELLED });
  }

  /** 404 when outside the organization, 403 when outside the caller's branches. */
  async getAccessible(tenant: TenantContext, id: string): Promise<GroupRow> {
    const group = await this.prisma.group.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: GROUP_SELECT,
    });
    if (!group) throw AppException.notFound(ErrorCode.GROUP_NOT_FOUND, 'Group not found');
    assertBranchAccess(tenant, group.branchId);
    return group;
  }

  /**
   * `getAccessible` + teacher scope: callers holding only the `*_own` variant of
   * `full` must be the group's teacher (403 GROUP_ACCESS_DENIED otherwise).
   */
  async getReadable(
    tenant: TenantContext,
    id: string,
    full: Parameters<TeacherScopeService['assertGroup']>[2],
  ): Promise<GroupRow> {
    const group = await this.getAccessible(tenant, id);
    await this.scope.assertGroup(tenant, group, full);
    return group;
  }

  /** The new teacher must be free at every active lesson slot of the group. */
  private async assertTeacherFree(
    tx: Prisma.TransactionClient,
    tenant: TenantContext,
    group: { id: string; startDate: Date; endDate: Date | null; teacherId: string },
  ): Promise<void> {
    await lockRows(tx, 'teachers', [group.teacherId], tenant.organizationId);
    const slots = await tx.schedule.findMany({
      where: { groupId: group.id, isActive: true },
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
    });
    for (const slot of slots) {
      await assertNoScheduleConflicts(tx, {
        slot,
        group,
        roomId: null,
        excludeScheduleId: slot.id,
        checks: { group: false, room: false },
      });
    }
  }

  private async assertLevelOfCourse(
    tenant: TenantContext,
    levelId: string,
    courseId: string,
  ): Promise<void> {
    const level = await this.levels.getInOrganization(tenant, levelId);
    if (level.courseId !== courseId) {
      throw AppException.badRequest(
        ErrorCode.LEVEL_COURSE_MISMATCH,
        'Level does not belong to the course',
      );
    }
    if (!level.isActive) throw AppException.conflict(ErrorCode.LEVEL_INACTIVE, 'Level is inactive');
  }
}

function assertDateOrder(start: Date, end: Date | null): void {
  if (end && end < start) {
    throw AppException.badRequest(
      ErrorCode.INVALID_DATE_RANGE,
      'endDate must not be before startDate',
    );
  }
}

const hasActiveEnrollments = (): AppException =>
  AppException.conflict(
    ErrorCode.GROUP_HAS_ACTIVE_ENROLLMENTS,
    'Group has active enrollments; transfer or cancel them first',
  );

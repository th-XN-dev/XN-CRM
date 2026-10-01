import { Injectable } from '@nestjs/common';
import { DayOfWeek, type GroupStatus, type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { formatTime, parseTime } from '../common/utils/times';
import { RUNNING_GROUP_STATUSES } from '../courses/courses.service';
import { PrismaService } from '../database/prisma.service';
import { lockRows } from '../database/row-lock';
import { GroupsService } from '../groups/groups.service';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { RoomsService } from '../rooms/rooms.service';
import { TeacherScopeService } from '../teachers/teacher-scope.service';
import { assertBranchAccess, scopedBranchWhere } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  type CreateScheduleDto,
  type ListSchedulesQueryDto,
  type TimetableQueryDto,
  type UpdateScheduleDto,
} from './dto/schedule.dto';
import { assertNoScheduleConflicts, type Slot, type SlotOwner } from './schedule-conflicts';

const SCHEDULE_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  groupId: true,
  roomId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  room: { select: { id: true, name: true, code: true } },
} satisfies Prisma.ScheduleSelect;

type ScheduleRow = Prisma.ScheduleGetPayload<{ select: typeof SCHEDULE_SELECT }>;

const DAY_ORDER = Object.values(DayOfWeek);

/** Weekly lesson slots. Every write re-checks group/room/teacher double booking under row locks. */
@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly rooms: RoomsService,
    private readonly events: DomainEventPublisher,
    private readonly teacherScope: TeacherScopeService,
  ) {}

  async create(tenant: TenantContext, groupId: string, dto: CreateScheduleDto) {
    const group = await this.groups.getAccessible(tenant, groupId);
    assertRunning(group.status);
    const slot = toSlot(dto);
    const roomId = dto.roomId === undefined ? group.roomId : dto.roomId;
    if (roomId) await this.rooms.getAssignable(tenant, roomId, group.branchId);

    const schedule = await this.prisma.$transaction(async (tx) => {
      await this.lockParticipants(tx, tenant, group, roomId);
      await assertNoScheduleConflicts(tx, { slot, group, roomId });
      return tx.schedule.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: group.branchId,
          groupId,
          roomId,
          ...slot,
        },
        select: SCHEDULE_SELECT,
      });
    });
    this.events.publish(tenant, {
      name: DomainEventName.SCHEDULE_CREATED,
      entityType: 'Schedule',
      entityId: schedule.id,
      payload: { groupId, dayOfWeek: schedule.dayOfWeek, roomId },
    });
    return toResponse(schedule);
  }

  /** Readable with groups.read, or groups.read_own for the group's own teacher. Ordered Monday → Sunday. */
  async list(tenant: TenantContext, groupId: string, query: ListSchedulesQueryDto) {
    await this.groups.getReadable(tenant, groupId, PERMISSIONS.GROUPS_READ);
    const where: Prisma.ScheduleWhereInput = { groupId, isActive: query.isActive };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.schedule.findMany({ where, select: SCHEDULE_SELECT }),
      this.prisma.schedule.count({ where }),
    ]);
    // Prisma sorts enums alphabetically; weekday order is done here (a group has a handful of slots).
    const sorted = rows
      .sort(
        (a, b) =>
          DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) ||
          a.startTime.getTime() - b.startTime.getTime(),
      )
      .slice(pageArgs(query).skip, pageArgs(query).skip + query.limit);
    return new Paginated(sorted.map(toResponse), total, query);
  }

  /**
   * Active slots of running groups in the caller's branches, Monday → Sunday.
   * Teachers holding only `groups.read_own` see their own groups' slots.
   */
  async timetable(tenant: TenantContext, query: TimetableQueryDto) {
    const rows = await this.prisma.schedule.findMany({
      where: {
        ...scopedBranchWhere(tenant, query.branchId),
        isActive: true,
        groupId: query.groupId,
        roomId: query.roomId,
        group: {
          status: { in: RUNNING_GROUP_STATUSES },
          teacherId: query.teacherId,
          ...(await this.teacherScope.groupWhere(tenant, PERMISSIONS.GROUPS_READ)),
        },
      },
      select: {
        ...SCHEDULE_SELECT,
        group: {
          select: {
            id: true,
            name: true,
            capacity: true,
            course: { select: { id: true, name: true, code: true } },
            teacher: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      take: 1000,
    });
    return rows
      .sort(
        (a, b) =>
          DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) ||
          a.startTime.getTime() - b.startTime.getTime(),
      )
      .map(toResponse);
  }

  async update(tenant: TenantContext, id: string, dto: UpdateScheduleDto) {
    const current = await this.getAccessible(tenant, id);
    const group = await this.groups.getAccessible(tenant, current.groupId);
    const slot = toSlot({
      dayOfWeek: dto.dayOfWeek ?? current.dayOfWeek,
      startTime: dto.startTime ?? formatTime(current.startTime),
      endTime: dto.endTime ?? formatTime(current.endTime),
    });
    const roomId = dto.roomId === undefined ? current.roomId : dto.roomId;
    if (roomId && roomId !== current.roomId) {
      await this.rooms.getAssignable(tenant, roomId, group.branchId);
    }
    const isActive = dto.isActive ?? current.isActive;
    if (isActive && !current.isActive) assertRunning(group.status);

    const schedule = await this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await this.lockParticipants(tx, tenant, group, roomId);
        await assertNoScheduleConflicts(tx, { slot, group, roomId, excludeScheduleId: id });
      }
      return tx.schedule.update({
        where: { id, organizationId: tenant.organizationId },
        data: { ...slot, roomId, isActive },
        select: SCHEDULE_SELECT,
      });
    });
    this.events.publish(tenant, {
      name: DomainEventName.SCHEDULE_UPDATED,
      entityType: 'Schedule',
      entityId: id,
      payload: { fields: Object.keys(dto) },
    });
    return toResponse(schedule);
  }

  /** Soft delete: the slot is deactivated and frees its room/teacher time. */
  remove(tenant: TenantContext, id: string) {
    return this.update(tenant, id, { isActive: false });
  }

  private async getAccessible(tenant: TenantContext, id: string): Promise<ScheduleRow> {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: SCHEDULE_SELECT,
    });
    if (!schedule) throw AppException.notFound(ErrorCode.SCHEDULE_NOT_FOUND, 'Schedule not found');
    assertBranchAccess(tenant, schedule.branchId);
    return schedule;
  }

  /** Lock order: group → room → teacher (see row-lock.ts). */
  private async lockParticipants(
    tx: Prisma.TransactionClient,
    tenant: TenantContext,
    group: SlotOwner,
    roomId: string | null,
  ): Promise<void> {
    await lockRows(tx, 'groups', [group.id], tenant.organizationId);
    if (roomId) await lockRows(tx, 'rooms', [roomId], tenant.organizationId);
    if (group.teacherId) await lockRows(tx, 'teachers', [group.teacherId], tenant.organizationId);
  }
}

function toSlot(input: { dayOfWeek: DayOfWeek; startTime: string; endTime: string }): Slot {
  if (input.startTime >= input.endTime) {
    throw AppException.badRequest(ErrorCode.INVALID_TIME_RANGE, 'startTime must be before endTime');
  }
  return {
    dayOfWeek: input.dayOfWeek,
    startTime: parseTime(input.startTime),
    endTime: parseTime(input.endTime),
  };
}

function assertRunning(status: GroupStatus): void {
  if (!RUNNING_GROUP_STATUSES.includes(status)) {
    throw AppException.conflict(ErrorCode.GROUP_NOT_ACTIVE, `Group is ${status}`);
  }
}

function toResponse<T extends ScheduleRow>(schedule: T) {
  return {
    ...schedule,
    startTime: formatTime(schedule.startTime),
    endTime: formatTime(schedule.endTime),
  };
}

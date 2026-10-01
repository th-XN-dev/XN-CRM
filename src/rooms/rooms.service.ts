import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { icontains, searchWhere } from '../common/pagination/search';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { RUNNING_GROUP_STATUSES } from '../courses/courses.service';
import { PrismaService } from '../database/prisma.service';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { assertBranchAccess, branchListFilter, branchOwnedWhere } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { type CreateRoomDto, type ListRoomsQueryDto, type UpdateRoomDto } from './dto/room.dto';

const ROOM_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  name: true,
  code: true,
  capacity: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true } },
} satisfies Prisma.RoomSelect;

type RoomRecord = Prisma.RoomGetPayload<{ select: typeof ROOM_SELECT }>;

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
  ) {}

  async create(tenant: TenantContext, dto: CreateRoomDto): Promise<RoomRecord> {
    const { branchId: requested, ...data } = dto;
    const branchId = await this.branches.resolveWritableBranch(tenant, requested);
    return this.save(() =>
      this.prisma.room.create({
        data: { ...data, branchId, organizationId: tenant.organizationId },
        select: ROOM_SELECT,
      }),
    );
  }

  async list(tenant: TenantContext, query: ListRoomsQueryDto) {
    const where: Prisma.RoomWhereInput = {
      AND: [
        branchOwnedWhere(tenant),
        { branchId: branchListFilter(tenant, query.branchId), isActive: query.isActive },
        searchWhere<Prisma.RoomWhereInput>(query.search, (term) => [
          { name: icontains(term) },
          { code: icontains(term) },
        ]) ?? {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.room.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: ROOM_SELECT,
      }),
      this.prisma.room.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  findOne(tenant: TenantContext, id: string): Promise<RoomRecord> {
    return this.getAccessible(tenant, id);
  }

  async update(tenant: TenantContext, id: string, dto: UpdateRoomDto): Promise<RoomRecord> {
    const current = await this.getAccessible(tenant, id);
    if (dto.isActive === false && current.isActive) await this.assertNotInUse(id);
    return this.save(() =>
      this.prisma.room.update({
        where: { id, organizationId: tenant.organizationId },
        data: dto,
        select: ROOM_SELECT,
      }),
    );
  }

  /** Soft delete. */
  deactivate(tenant: TenantContext, id: string): Promise<RoomRecord> {
    return this.update(tenant, id, { isActive: false });
  }

  /** 404 outside the organization, 403 outside the caller's branches. */
  async getAccessible(tenant: TenantContext, id: string): Promise<RoomRecord> {
    const room = await this.prisma.room.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: ROOM_SELECT,
    });
    if (!room) throw AppException.notFound(ErrorCode.ROOM_NOT_FOUND, 'Room not found');
    assertBranchAccess(tenant, room.branchId);
    return room;
  }

  /** A room usable by a group/schedule of `branchId`: same branch and active. */
  async getAssignable(tenant: TenantContext, id: string, branchId: string): Promise<RoomRecord> {
    const room = await this.getAccessible(tenant, id);
    if (room.branchId !== branchId) {
      throw AppException.badRequest(
        ErrorCode.ROOM_BRANCH_MISMATCH,
        'Room belongs to another branch than the group',
      );
    }
    if (!room.isActive) throw AppException.conflict(ErrorCode.ROOM_INACTIVE, 'Room is inactive');
    return room;
  }

  private async assertNotInUse(roomId: string): Promise<void> {
    const [groups, schedules] = await this.prisma.$transaction([
      this.prisma.group.count({ where: { roomId, status: { in: RUNNING_GROUP_STATUSES } } }),
      this.prisma.schedule.count({
        where: { roomId, isActive: true, group: { status: { in: RUNNING_GROUP_STATUSES } } },
      }),
    ]);
    if (groups + schedules > 0) {
      throw AppException.conflict(
        ErrorCode.ROOM_IN_USE,
        'Room is used by active groups or schedules; move them first',
      );
    }
  }

  private async save<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.ROOM_CODE_TAKEN,
          'A room with this code already exists in the branch',
        );
      }
      throw error;
    }
  }
}

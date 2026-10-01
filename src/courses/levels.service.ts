import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { type TenantContext } from '../tenancy/tenant-context';
import { CoursesService, LEVEL_SELECT, RUNNING_GROUP_STATUSES } from './courses.service';
import { type CreateLevelDto, type ListLevelsQueryDto, type UpdateLevelDto } from './dto/level.dto';

type LevelRecord = Prisma.LevelGetPayload<{ select: typeof LEVEL_SELECT }>;

/** Levels have no organizationId: isolation always goes through `course.organizationId`. */
@Injectable()
export class LevelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courses: CoursesService,
  ) {}

  async create(tenant: TenantContext, courseId: string, dto: CreateLevelDto): Promise<LevelRecord> {
    const course = await this.courses.getInOrganization(tenant, courseId);
    if (!course.isActive)
      throw AppException.conflict(ErrorCode.COURSE_INACTIVE, 'Course is inactive');
    try {
      return await this.prisma.level.create({ data: { ...dto, courseId }, select: LEVEL_SELECT });
    } catch (error) {
      throw translateCodeConflict(error);
    }
  }

  async list(tenant: TenantContext, courseId: string, query: ListLevelsQueryDto) {
    await this.courses.getInOrganization(tenant, courseId);
    const where: Prisma.LevelWhereInput = { courseId, isActive: query.isActive };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.level.findMany({
        where,
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        ...pageArgs(query),
        select: LEVEL_SELECT,
      }),
      this.prisma.level.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  async update(tenant: TenantContext, id: string, dto: UpdateLevelDto): Promise<LevelRecord> {
    await this.getInOrganization(tenant, id);
    if (dto.isActive === false) {
      const running = await this.prisma.group.count({
        where: { levelId: id, status: { in: RUNNING_GROUP_STATUSES } },
      });
      if (running > 0) {
        throw AppException.conflict(
          ErrorCode.LEVEL_HAS_ACTIVE_GROUPS,
          'Level is used by active or paused groups',
        );
      }
    }
    try {
      return await this.prisma.level.update({ where: { id }, data: dto, select: LEVEL_SELECT });
    } catch (error) {
      throw translateCodeConflict(error);
    }
  }

  /** Soft delete. */
  deactivate(tenant: TenantContext, id: string): Promise<LevelRecord> {
    return this.update(tenant, id, { isActive: false });
  }

  async getInOrganization(tenant: TenantContext, id: string): Promise<LevelRecord> {
    const level = await this.prisma.level.findFirst({
      where: { id, course: { organizationId: tenant.organizationId } },
      select: LEVEL_SELECT,
    });
    if (!level) throw AppException.notFound(ErrorCode.LEVEL_NOT_FOUND, 'Level not found');
    return level;
  }
}

function translateCodeConflict(error: unknown): unknown {
  return isUniqueViolation(error)
    ? AppException.conflict(
        ErrorCode.LEVEL_CODE_TAKEN,
        'A level with this code already exists in the course',
      )
    : error;
}

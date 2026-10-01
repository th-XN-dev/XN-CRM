import { Injectable } from '@nestjs/common';
import { GroupStatus, type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { icontains, searchWhere } from '../common/pagination/search';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  type CreateCourseDto,
  type ListCoursesQueryDto,
  type UpdateCourseDto,
} from './dto/course.dto';

export const COURSE_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  description: true,
  monthlyPrice: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CourseSelect;

export const LEVEL_SELECT = {
  id: true,
  courseId: true,
  name: true,
  code: true,
  description: true,
  order: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LevelSelect;

type CourseRecord = Prisma.CourseGetPayload<{ select: typeof COURSE_SELECT }>;

/** Groups that still run: a course/level they use can't be deactivated. */
export const RUNNING_GROUP_STATUSES: GroupStatus[] = [GroupStatus.ACTIVE, GroupStatus.PAUSED];

/** Courses are organization-wide (not tied to a branch). */
@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenant: TenantContext, dto: CreateCourseDto): Promise<CourseRecord> {
    try {
      return await this.prisma.course.create({
        data: { ...dto, organizationId: tenant.organizationId },
        select: COURSE_SELECT,
      });
    } catch (error) {
      throw translateCodeConflict(error);
    }
  }

  async list(tenant: TenantContext, query: ListCoursesQueryDto) {
    const where: Prisma.CourseWhereInput = {
      organizationId: tenant.organizationId,
      isActive: query.isActive,
      ...searchWhere<Prisma.CourseWhereInput>(query.search, (term) => [
        { name: icontains(term) },
        { code: icontains(term) },
      ]),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: { ...COURSE_SELECT, _count: { select: { levels: true } } },
      }),
      this.prisma.course.count({ where }),
    ]);
    return new Paginated(
      items.map(({ _count, ...course }) => ({ ...course, levelsCount: _count.levels })),
      total,
      query,
    );
  }

  async findOne(tenant: TenantContext, id: string) {
    await this.getInOrganization(tenant, id);
    return this.prisma.course.findUniqueOrThrow({
      where: { id },
      select: {
        ...COURSE_SELECT,
        levels: { orderBy: [{ order: 'asc' }, { name: 'asc' }], select: LEVEL_SELECT },
      },
    });
  }

  async update(tenant: TenantContext, id: string, dto: UpdateCourseDto): Promise<CourseRecord> {
    await this.getInOrganization(tenant, id);
    if (dto.isActive === false) await this.assertNoRunningGroups(id);
    try {
      return await this.prisma.course.update({
        where: { id, organizationId: tenant.organizationId },
        data: dto,
        select: COURSE_SELECT,
      });
    } catch (error) {
      throw translateCodeConflict(error);
    }
  }

  /** Soft delete. */
  deactivate(tenant: TenantContext, id: string): Promise<CourseRecord> {
    return this.update(tenant, id, { isActive: false });
  }

  async getInOrganization(tenant: TenantContext, id: string): Promise<CourseRecord> {
    const course = await this.prisma.course.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: COURSE_SELECT,
    });
    if (!course) throw AppException.notFound(ErrorCode.COURSE_NOT_FOUND, 'Course not found');
    return course;
  }

  private async assertNoRunningGroups(courseId: string): Promise<void> {
    const running = await this.prisma.group.count({
      where: { courseId, status: { in: RUNNING_GROUP_STATUSES } },
    });
    if (running > 0) {
      throw AppException.conflict(
        ErrorCode.COURSE_HAS_ACTIVE_GROUPS,
        'Course has active or paused groups; complete or cancel them first',
      );
    }
  }
}

function translateCodeConflict(error: unknown): unknown {
  return isUniqueViolation(error)
    ? AppException.conflict(ErrorCode.COURSE_CODE_TAKEN, 'A course with this code already exists')
    : error;
}

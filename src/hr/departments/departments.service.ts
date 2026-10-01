import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEventName } from '../../common/events/domain-events';
import { DomainEventPublisher } from '../../common/events/domain-event.publisher';
import { Paginated } from '../../common/pagination/paginated';
import { pageArgs } from '../../common/pagination/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { type TenantContext } from '../../tenancy/tenant-context';
import {
  type CreateDirectoryItemDto,
  type ListDirectoryQueryDto,
  type UpdateDirectoryItemDto,
} from '../common/directory.dto';
import {
  DIRECTORY_WITH_COUNT_SELECT,
  directoryWhere,
  guardCode,
  presentDirectoryItem,
} from '../common/directory.helpers';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
  ) {}

  async create(tenant: TenantContext, dto: CreateDirectoryItemDto) {
    const department = await guardCode(
      () =>
        this.prisma.department.create({
          data: { ...dto, organizationId: tenant.organizationId },
          select: DIRECTORY_WITH_COUNT_SELECT,
        }),
      codeTaken,
    );
    this.events.publish(tenant, {
      name: DomainEventName.DEPARTMENT_CREATED,
      entityType: 'Department',
      entityId: department.id,
      payload: { code: department.code },
    });
    return presentDirectoryItem(department);
  }

  async list(tenant: TenantContext, query: ListDirectoryQueryDto) {
    const where = directoryWhere(tenant, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.department.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: DIRECTORY_WITH_COUNT_SELECT,
      }),
      this.prisma.department.count({ where }),
    ]);
    return new Paginated(items.map(presentDirectoryItem), total, query);
  }

  async findOne(tenant: TenantContext, id: string) {
    return presentDirectoryItem(await this.getAccessible(tenant, id));
  }

  async update(tenant: TenantContext, id: string, dto: UpdateDirectoryItemDto) {
    await this.getAccessible(tenant, id);
    const department = await guardCode(
      () =>
        this.prisma.department.update({
          where: { id, organizationId: tenant.organizationId },
          data: dto,
          select: DIRECTORY_WITH_COUNT_SELECT,
        }),
      codeTaken,
    );
    this.publishUpdated(tenant, id, Object.keys(dto));
    return presentDirectoryItem(department);
  }

  /** Soft delete: employees keep the department; it can no longer be assigned. */
  async remove(tenant: TenantContext, id: string) {
    await this.getAccessible(tenant, id);
    const department = await this.prisma.department.update({
      where: { id, organizationId: tenant.organizationId },
      data: { isActive: false },
      select: DIRECTORY_WITH_COUNT_SELECT,
    });
    this.publishUpdated(tenant, id, ['isActive']);
    return presentDirectoryItem(department);
  }

  /** For employee create/update: the department must exist in the organization and be active. */
  async assertAssignable(tenant: TenantContext, id: string): Promise<void> {
    const department = await this.getAccessible(tenant, id);
    if (!department.isActive) {
      throw AppException.conflict(ErrorCode.DEPARTMENT_INACTIVE, 'Department is inactive');
    }
  }

  private async getAccessible(tenant: TenantContext, id: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: DIRECTORY_WITH_COUNT_SELECT,
    });
    if (!department)
      throw AppException.notFound(ErrorCode.DEPARTMENT_NOT_FOUND, 'Department not found');
    return department;
  }

  private publishUpdated(tenant: TenantContext, id: string, fields: string[]): void {
    this.events.publish(tenant, {
      name: DomainEventName.DEPARTMENT_UPDATED,
      entityType: 'Department',
      entityId: id,
      payload: { fields },
    });
  }
}

const codeTaken = (): AppException =>
  AppException.conflict(
    ErrorCode.DEPARTMENT_CODE_TAKEN,
    'A department with this code already exists',
  );

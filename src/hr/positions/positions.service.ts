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
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
  ) {}

  async create(tenant: TenantContext, dto: CreateDirectoryItemDto) {
    const position = await guardCode(
      () =>
        this.prisma.position.create({
          data: { ...dto, organizationId: tenant.organizationId },
          select: DIRECTORY_WITH_COUNT_SELECT,
        }),
      codeTaken,
    );
    this.events.publish(tenant, {
      name: DomainEventName.POSITION_CREATED,
      entityType: 'Position',
      entityId: position.id,
      payload: { code: position.code },
    });
    return presentDirectoryItem(position);
  }

  async list(tenant: TenantContext, query: ListDirectoryQueryDto) {
    const where = directoryWhere(tenant, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.position.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: DIRECTORY_WITH_COUNT_SELECT,
      }),
      this.prisma.position.count({ where }),
    ]);
    return new Paginated(items.map(presentDirectoryItem), total, query);
  }

  async findOne(tenant: TenantContext, id: string) {
    return presentDirectoryItem(await this.getAccessible(tenant, id));
  }

  async update(tenant: TenantContext, id: string, dto: UpdateDirectoryItemDto) {
    await this.getAccessible(tenant, id);
    const position = await guardCode(
      () =>
        this.prisma.position.update({
          where: { id, organizationId: tenant.organizationId },
          data: dto,
          select: DIRECTORY_WITH_COUNT_SELECT,
        }),
      codeTaken,
    );
    this.publishUpdated(tenant, id, Object.keys(dto));
    return presentDirectoryItem(position);
  }

  /** Soft delete: employees keep the position; it can no longer be assigned. */
  async remove(tenant: TenantContext, id: string) {
    await this.getAccessible(tenant, id);
    const position = await this.prisma.position.update({
      where: { id, organizationId: tenant.organizationId },
      data: { isActive: false },
      select: DIRECTORY_WITH_COUNT_SELECT,
    });
    this.publishUpdated(tenant, id, ['isActive']);
    return presentDirectoryItem(position);
  }

  /** For employee create/update: the position must exist in the organization and be active. */
  async assertAssignable(tenant: TenantContext, id: string): Promise<void> {
    const position = await this.getAccessible(tenant, id);
    if (!position.isActive) {
      throw AppException.conflict(ErrorCode.POSITION_INACTIVE, 'Position is inactive');
    }
  }

  private async getAccessible(tenant: TenantContext, id: string) {
    const position = await this.prisma.position.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: DIRECTORY_WITH_COUNT_SELECT,
    });
    if (!position) throw AppException.notFound(ErrorCode.POSITION_NOT_FOUND, 'Position not found');
    return position;
  }

  private publishUpdated(tenant: TenantContext, id: string, fields: string[]): void {
    this.events.publish(tenant, {
      name: DomainEventName.POSITION_UPDATED,
      entityType: 'Position',
      entityId: id,
      payload: { fields },
    });
  }
}

const codeTaken = (): AppException =>
  AppException.conflict(ErrorCode.POSITION_CODE_TAKEN, 'A position with this code already exists');

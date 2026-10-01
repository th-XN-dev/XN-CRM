import { Injectable } from '@nestjs/common';
import { CenterStatus, type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { slugify } from '../common/utils/slug';
import { PrismaService } from '../database/prisma.service';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  type CreateSubCenterDto,
  type ListSubCentersQueryDto,
  type SubCenterStatusDto,
  type UpdateSubCenterDto,
} from './dto/sub-center.dto';

const SUB_CENTER_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  slug: true,
  logoUrl: true,
  primaryColor: true,
  phone: true,
  address: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  branches: {
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true, isActive: true },
  },
} satisfies Prisma.SubCenterSelect;

/**
 * Divisions of a center. Every query is filtered by the caller's center, so
 * ids of another center never match (404, same as non-existent).
 */
@Injectable()
export class SubCentersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
  ) {}

  list(tenant: TenantContext, query: ListSubCentersQueryDto) {
    return this.prisma.subCenter.findMany({
      where: { organizationId: tenant.organizationId, status: query.status },
      orderBy: { name: 'asc' },
      select: SUB_CENTER_SELECT,
    });
  }

  async findOne(tenant: TenantContext, id: string) {
    const subCenter = await this.prisma.subCenter.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: SUB_CENTER_SELECT,
    });
    if (!subCenter) throw subCenterNotFound();
    return subCenter;
  }

  async create(tenant: TenantContext, dto: CreateSubCenterDto) {
    const created = await this.write(() =>
      this.prisma.subCenter.create({
        data: {
          ...dto,
          slug: dto.slug ?? (slugify(dto.name, 80) || dto.code.toLowerCase()),
          organizationId: tenant.organizationId,
        },
        select: SUB_CENTER_SELECT,
      }),
    );
    this.events.publish(tenant, {
      name: DomainEventName.SUB_CENTER_CREATED,
      entityType: 'SubCenter',
      entityId: created.id,
      payload: { name: created.name, code: created.code },
    });
    return created;
  }

  async update(tenant: TenantContext, id: string, dto: UpdateSubCenterDto) {
    await this.findOne(tenant, id);
    const updated = await this.write(() =>
      this.prisma.subCenter.update({
        where: { id, organizationId: tenant.organizationId },
        data: dto,
        select: SUB_CENTER_SELECT,
      }),
    );
    this.events.publish(tenant, {
      name: DomainEventName.SUB_CENTER_UPDATED,
      entityType: 'SubCenter',
      entityId: id,
      payload: { ...dto },
    });
    return updated;
  }

  async setStatus(tenant: TenantContext, id: string, dto: SubCenterStatusDto) {
    const current = await this.findOne(tenant, id);
    if (current.status === dto.status) return current;
    const updated = await this.prisma.subCenter.update({
      where: { id, organizationId: tenant.organizationId },
      data: { status: dto.status },
      select: SUB_CENTER_SELECT,
    });
    this.events.publish(tenant, {
      name: DomainEventName.SUB_CENTER_STATUS_CHANGED,
      entityType: 'SubCenter',
      entityId: id,
      payload: { from: current.status, to: dto.status },
    });
    return updated;
  }

  private async write<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.SUB_CENTER_CODE_TAKEN,
          'A sub-center with this code or slug already exists in the center',
        );
      }
      throw error;
    }
  }
}

export const subCenterNotFound = (): AppException =>
  AppException.notFound(ErrorCode.SUB_CENTER_NOT_FOUND, 'Sub-center not found');

/** A branch may be put under a sub-center of the same center that isn't archived. */
export async function assertAssignableSubCenter(
  prisma: PrismaService,
  organizationId: string,
  subCenterId: string,
): Promise<void> {
  const subCenter = await prisma.subCenter.findFirst({
    where: { id: subCenterId, organizationId },
    select: { status: true },
  });
  if (!subCenter) throw subCenterNotFound();
  if (subCenter.status === CenterStatus.ARCHIVED) {
    throw AppException.conflict(ErrorCode.SUB_CENTER_INACTIVE, 'The sub-center is archived');
  }
}

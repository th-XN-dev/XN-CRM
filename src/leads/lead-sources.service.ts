import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  type CreateLeadSourceDto,
  type ListLeadSourcesQueryDto,
  type UpdateLeadSourceDto,
} from './dto/lead-source.dto';

const SOURCE_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadSourceSelect;

@Injectable()
export class LeadSourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenant: TenantContext, dto: CreateLeadSourceDto) {
    try {
      return await this.prisma.leadSource.create({
        data: { ...dto, organizationId: tenant.organizationId },
        select: SOURCE_SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw codeTaken();
      throw error;
    }
  }

  list(tenant: TenantContext, query: ListLeadSourcesQueryDto) {
    return this.prisma.leadSource.findMany({
      where: { organizationId: tenant.organizationId, isActive: query.isActive },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: SOURCE_SELECT,
    });
  }

  findOne(tenant: TenantContext, id: string) {
    return this.getAccessible(tenant, id);
  }

  async update(tenant: TenantContext, id: string, dto: UpdateLeadSourceDto) {
    await this.getAccessible(tenant, id);
    try {
      return await this.prisma.leadSource.update({
        where: { id, organizationId: tenant.organizationId },
        data: dto,
        select: SOURCE_SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw codeTaken();
      throw error;
    }
  }

  /** Soft delete: sources referenced by leads are kept; the source is deactivated. */
  async remove(tenant: TenantContext, id: string) {
    await this.getAccessible(tenant, id);
    return this.prisma.leadSource.update({
      where: { id, organizationId: tenant.organizationId },
      data: { isActive: false },
      select: SOURCE_SELECT,
    });
  }

  async getAccessible(tenant: TenantContext, id: string) {
    const source = await this.prisma.leadSource.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: SOURCE_SELECT,
    });
    if (!source) {
      throw AppException.notFound(ErrorCode.LEAD_SOURCE_NOT_FOUND, 'Lead source not found');
    }
    return source;
  }

  /** Validates a source id (for lead create/update): it must exist and be active. */
  async assertUsable(tenant: TenantContext, id: string): Promise<void> {
    const source = await this.getAccessible(tenant, id);
    if (!source.isActive) {
      throw AppException.conflict(ErrorCode.LEAD_SOURCE_INACTIVE, 'Lead source is inactive');
    }
  }
}

const codeTaken = (): AppException =>
  AppException.conflict(ErrorCode.LEAD_SOURCE_CODE_TAKEN, 'A source with this code already exists');

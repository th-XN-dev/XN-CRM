import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { PrismaService } from '../database/prisma.service';
import { assertAssignableSubCenter } from '../sub-centers/sub-centers.service';
import { hasBranchAccess, type TenantContext } from '../tenancy/tenant-context';
import { type CreateBranchDto } from './dto/create-branch.dto';
import { type ListBranchesQueryDto } from './dto/list-branches-query.dto';
import { type UpdateBranchDto } from './dto/update-branch.dto';

const BRANCH_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  phone: true,
  address: true,
  isActive: true,
  subCenterId: true,
  subCenter: { select: { id: true, name: true, code: true, status: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BranchSelect;

/** Every query here is filtered by `tenant.organizationId`, so ids from other organizations never match. */
@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
  ) {}

  async create(tenant: TenantContext, dto: CreateBranchDto) {
    if (dto.subCenterId) {
      await assertAssignableSubCenter(this.prisma, tenant.organizationId, dto.subCenterId);
    }
    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const branch = await tx.branch.create({
          data: { ...dto, organizationId: tenant.organizationId },
          select: BRANCH_SELECT,
        });
        // A creator limited to specific branches must be able to see what they created.
        if (!tenant.allBranches) {
          await tx.branchMembership.create({
            data: {
              membershipId: tenant.membershipId,
              branchId: branch.id,
              organizationId: tenant.organizationId,
            },
          });
        }
        return branch;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw codeTaken();
      throw error;
    }
    this.events.publish(tenant, {
      name: DomainEventName.BRANCH_CREATED,
      entityType: 'Branch',
      entityId: created.id,
      payload: {
        branchId: created.id,
        name: created.name,
        code: created.code,
        subCenterId: created.subCenterId,
      },
    });
    return created;
  }

  /** Branch selector: branches of the current organization the caller can access. */
  list(tenant: TenantContext, query: ListBranchesQueryDto) {
    return this.prisma.branch.findMany({
      where: {
        organizationId: tenant.organizationId,
        deletedAt: null,
        isActive: query.isActive,
        subCenterId: query.subCenterId,
        ...(!tenant.allBranches && { id: { in: [...tenant.branchIds] } }),
      },
      orderBy: { name: 'asc' },
      select: BRANCH_SELECT,
    });
  }

  async findOne(tenant: TenantContext, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, organizationId: tenant.organizationId, deletedAt: null },
      select: BRANCH_SELECT,
    });
    // Branches of other organizations are indistinguishable from non-existent ones.
    if (!branch) throw AppException.notFound(ErrorCode.BRANCH_NOT_FOUND, 'Branch not found');
    if (!hasBranchAccess(tenant, branch.id)) {
      throw AppException.forbidden(
        ErrorCode.BRANCH_ACCESS_DENIED,
        'You do not have access to this branch',
      );
    }
    return branch;
  }

  async update(tenant: TenantContext, id: string, dto: UpdateBranchDto) {
    const before = await this.findOne(tenant, id);
    if (dto.subCenterId) {
      await assertAssignableSubCenter(this.prisma, tenant.organizationId, dto.subCenterId);
    }
    let updated;
    try {
      updated = await this.prisma.branch.update({
        where: { id, organizationId: tenant.organizationId },
        data: dto,
        select: BRANCH_SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw codeTaken();
      throw error;
    }
    const changed = Object.fromEntries(
      Object.entries(dto).filter(([key, value]) => value !== undefined && key !== 'subCenter'),
    );
    this.events.publish(tenant, {
      name: DomainEventName.BRANCH_UPDATED,
      entityType: 'Branch',
      entityId: id,
      payload: {
        branchId: id,
        ...changed,
        ...(dto.subCenterId !== undefined && { fromSubCenterId: before.subCenterId }),
      },
    });
    return updated;
  }
}

const codeTaken = (): AppException =>
  AppException.conflict(
    ErrorCode.BRANCH_CODE_TAKEN,
    'A branch with this code already exists in the organization',
  );

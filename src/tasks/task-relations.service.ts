import { Injectable } from '@nestjs/common';
import { TaskRelatedType } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../database/prisma.service';
import { assertBranchAccess } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';

/**
 * `relatedType` + `relatedId` is a polymorphic link without an FK, so the
 * backend verifies the target: it must exist in the caller's organization and,
 * for branch-owned resources, in a branch the caller can access.
 */
@Injectable()
export class TaskRelationsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertExists(tenant: TenantContext, type: TaskRelatedType, id: string): Promise<void> {
    const organizationId = tenant.organizationId;
    let target: { branchId?: string; id?: string } | null;
    switch (type) {
      case TaskRelatedType.LEAD:
        target = await this.prisma.lead.findFirst({
          where: { id, organizationId, deletedAt: null },
          select: { branchId: true },
        });
        break;
      case TaskRelatedType.STUDENT:
        target = await this.prisma.student.findFirst({
          where: { id, organizationId },
          select: { branchId: true },
        });
        break;
      case TaskRelatedType.GROUP:
        target = await this.prisma.group.findFirst({
          where: { id, organizationId },
          select: { branchId: true },
        });
        break;
      case TaskRelatedType.FAMILY:
        target = await this.prisma.family.findFirst({
          where: { id, organizationId },
          select: { id: true },
        });
        break;
      case TaskRelatedType.EMPLOYEE:
        target = await this.prisma.employee.findFirst({
          where: { id, organizationId },
          select: { id: true },
        });
        break;
    }
    if (!target) {
      throw AppException.notFound(
        ErrorCode.TASK_RELATED_NOT_FOUND,
        `Related ${type.toLowerCase()} not found`,
      );
    }
    if (target.branchId) assertBranchAccess(tenant, target.branchId);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { CenterStatus, MembershipStatus, type Prisma, StudentStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { currentRequestContext } from '../../common/context/request-context';
import { type AuthUser } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import { centerNotFound } from './owner-centers.service';

/** Generous: a center's whole history is removed in one transaction. */
const PURGE_TIMEOUT_MS = 120_000;

export interface PurgeResult {
  id: string;
  name: string;
  /** Accounts that belonged to this center only and were removed with it. */
  deletedUsers: number;
}

/**
 * Permanent deletion of a center — the "clearly defined case" for a hard
 * delete: only an ARCHIVED center (the lifecycle's last step), only by the
 * platform owner, with a typed confirmation, in one transaction. The audit
 * trail is append-only and has no FKs, so the CENTER_DELETED row and the
 * center's earlier history survive the deletion.
 */
@Injectable()
export class CenterPurgeService {
  private readonly logger = new Logger(CenterPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async purge(actor: AuthUser, id: string): Promise<PurgeResult> {
    const center = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        _count: {
          select: {
            branches: true,
            students: true,
            payments: true,
            memberships: { where: { status: MembershipStatus.ACTIVE } },
          },
        },
        memberships: { select: { userId: true } },
      },
    });
    if (!center) throw centerNotFound();
    if (center.status !== CenterStatus.ARCHIVED) {
      throw AppException.conflict(
        ErrorCode.CENTER_NOT_ARCHIVED,
        'Archive the center before deleting it permanently',
      );
    }
    const activeStudents = await this.prisma.student.count({
      where: { organizationId: id, status: StudentStatus.ACTIVE },
    });

    await this.prisma.$transaction((tx) => deleteCenterData(tx, id), {
      timeout: PURGE_TIMEOUT_MS,
      maxWait: 10_000,
    });
    const deletedUsers = await this.deleteOrphanedUsers(center.memberships.map((m) => m.userId));

    await this.audit.record({
      organizationId: id,
      userId: actor.id,
      action: 'CENTER_DELETED',
      entityType: 'Center',
      entityId: id,
      oldData: {
        name: center.name,
        slug: center.slug,
        branches: center._count.branches,
        students: center._count.students,
        activeStudents,
        payments: center._count.payments,
        members: center._count.memberships,
      },
      newData: { deletedUsers },
      context: currentRequestContext(),
    });
    return { id, name: center.name, deletedUsers };
  }

  /**
   * Accounts left without any center, center ownership or platform role are
   * removed too (e.g. a director created for this center). Anyone still
   * referenced elsewhere is kept — deleting them is never forced.
   */
  private async deleteOrphanedUsers(userIds: string[]): Promise<number> {
    const candidates = await this.prisma.user.findMany({
      where: {
        id: { in: [...new Set(userIds)] },
        platformRole: null,
        memberships: { none: {} },
        ownedOrganizations: { none: {} },
      },
      select: { id: true },
    });
    let deleted = 0;
    for (const { id } of candidates) {
      try {
        await this.prisma.user.delete({ where: { id } });
        deleted++;
      } catch (error) {
        this.logger.warn(`Kept user ${id} after center deletion: ${String(error)}`);
      }
    }
    return deleted;
  }
}

/** Children before parents; every table is filtered by the center. */
async function deleteCenterData(tx: Prisma.TransactionClient, organizationId: string) {
  const where = { organizationId };
  await tx.notificationDelivery.deleteMany({ where });
  await tx.notification.deleteMany({ where });
  await tx.notificationPreference.deleteMany({ where });
  await tx.notificationTemplate.deleteMany({ where });
  await tx.notificationPolicy.deleteMany({ where });
  await tx.checklistItem.deleteMany({ where });
  await tx.checklistTemplate.deleteMany({ where });
  await tx.dashboardLayout.deleteMany({ where });
  await tx.taskComment.deleteMany({ where });
  await tx.taskActivity.deleteMany({ where });
  await tx.task.deleteMany({ where });
  await tx.employeeBranch.deleteMany({ where });
  await tx.employee.deleteMany({ where });
  await tx.position.deleteMany({ where });
  await tx.department.deleteMany({ where });
  await tx.leadActivity.deleteMany({ where });
  await tx.lead.deleteMany({ where });
  await tx.leadStage.deleteMany({ where });
  await tx.leadPipeline.deleteMany({ where });
  await tx.leadSource.deleteMany({ where });
  await tx.refund.deleteMany({ where });
  await tx.payment.deleteMany({ where });
  await tx.expense.deleteMany({ where });
  await tx.cashSession.deleteMany({ where });
  await tx.invoice.deleteMany({ where });
  await tx.documentCounter.deleteMany({ where });
  await tx.attendance.deleteMany({ where });
  await tx.schedule.deleteMany({ where });
  await tx.enrollment.deleteMany({ where });
  await tx.student.deleteMany({ where });
  await tx.family.deleteMany({ where });
  await tx.group.deleteMany({ where });
  await tx.teacher.deleteMany({ where });
  await tx.room.deleteMany({ where });
  await tx.level.deleteMany({ where: { course: { organizationId } } });
  await tx.course.deleteMany({ where });
  await tx.branchMembership.deleteMany({ where });
  await tx.organizationMembership.deleteMany({ where });
  await tx.branch.deleteMany({ where });
  await tx.subCenter.deleteMany({ where });
  await tx.role.deleteMany({ where });
  await tx.organization.delete({ where: { id: organizationId } });
}

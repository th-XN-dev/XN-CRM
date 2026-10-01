import { Injectable } from '@nestjs/common';
import { MembershipStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Who may receive a notification. Always derived from the database:
 * active members of the organization (active users), optionally holding a
 * permission and able to access the notification's branch.
 */
@Injectable()
export class RecipientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Members holding `permission` with access to `branchId` (any branch when null). */
  async withPermission(
    organizationId: string,
    branchId: string | null,
    permission: string,
  ): Promise<string[]> {
    return this.members({
      organizationId,
      role: { permissions: { some: { permission: { key: permission } } } },
      ...(branchId && { OR: [{ allBranches: true }, { branches: { some: { branchId } } }] }),
    });
  }

  /** The subset of `userIds` that are active members of the organization. */
  async activeMembers(organizationId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    return this.members({ organizationId, userId: { in: userIds } });
  }

  /** Channel addresses of the recipients. */
  contacts(userIds: string[]) {
    return this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        phone: true,
        telegramAccount: { select: { chatId: true, isVerified: true } },
      },
    });
  }

  private async members(where: Prisma.OrganizationMembershipWhereInput): Promise<string[]> {
    const rows = await this.prisma.organizationMembership.findMany({
      where: {
        ...where,
        status: MembershipStatus.ACTIVE,
        user: { isActive: true, deletedAt: null },
      },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }
}

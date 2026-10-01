import { Injectable } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GRANTABLE_PERMISSIONS } from '../permissions/permissions.catalog';
import {
  type CenterAvailability,
  centerAvailability,
  CENTER_LIFECYCLE_SELECT,
  LISTED_CENTER_WHERE,
  USABLE_BRANCH_WHERE,
} from '../platform/center-availability';
import { type TenantContext } from './tenant-context';

export interface ResolvedTenant {
  tenant: Omit<TenantContext, 'branchId'>;
  /** Members may only work in an ACTIVE center (TenantGuard rejects the rest with the reason). */
  availability: CenterAvailability;
}

@Injectable()
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads the caller's active membership in an active organization, with role
   * permissions and branch assignments, in a single query. Returns null when
   * the user has no access — callers must not distinguish "not found" from
   * "not a member" to avoid leaking which organizations exist. Archived
   * centers count as not found; frozen/expired ones resolve with the reason.
   */
  async resolve(userId: string, organizationId: string): Promise<ResolvedTenant | null> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        status: MembershipStatus.ACTIVE,
        organization: LISTED_CENTER_WHERE,
        // A role must be either a system role or belong to this very organization.
        role: { OR: [{ organizationId: null }, { organizationId }] },
      },
      select: {
        id: true,
        allBranches: true,
        grantedPermissions: true,
        organization: { select: CENTER_LIFECYCLE_SELECT },
        role: {
          select: {
            id: true,
            key: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
        branches: { select: { branchId: true } },
      },
    });
    if (!membership) return null;

    return {
      availability: centerAvailability(membership.organization),
      tenant: {
        userId,
        organizationId,
        timezone: membership.organization.timezone,
        membershipId: membership.id,
        role: { id: membership.role.id, key: membership.role.key },
        // Role permissions plus individual grants (only from the grantable list).
        permissions: new Set([
          ...membership.role.permissions.map((rp) => rp.permission.key),
          ...membership.grantedPermissions.filter((key) =>
            (GRANTABLE_PERMISSIONS as readonly string[]).includes(key),
          ),
        ]),
        allBranches: membership.allBranches,
        branchIds: membership.branches.map((b) => b.branchId),
      },
    };
  }

  /** Active branch of the center whose sub-center (if any) is active too. */
  async isActiveBranchOf(branchId: string, organizationId: string): Promise<boolean> {
    const count = await this.prisma.branch.count({
      where: { id: branchId, organizationId, ...USABLE_BRANCH_WHERE },
    });
    return count > 0;
  }
}

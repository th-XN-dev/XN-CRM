import { Injectable } from '@nestjs/common';
import { MembershipStatus, type Prisma } from '@prisma/client';
import { PasswordService } from '../auth/password.service';
import { generateTemporaryPassword } from '../auth/temporary-password';
import { TokenService } from '../auth/token.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { icontains } from '../common/pagination/search';
import { normalizeEmail, normalizePhone } from '../common/utils/normalize';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { roleTier, STAFF_ROLE_KEYS, SYSTEM_ROLES } from '../roles/roles.catalog';
import { assertBranchAccess } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { type CreateStaffDto, type ListStaffQueryDto, type UpdateStaffDto } from './dto/staff.dto';

const STAFF_SELECT = {
  id: true,
  status: true,
  allBranches: true,
  grantedPermissions: true,
  createdAt: true,
  role: { select: { key: true } },
  branches: { select: { branch: { select: { id: true, name: true } } } },
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      lastLoginAt: true,
      mustChangePassword: true,
    },
  },
} satisfies Prisma.OrganizationMembershipSelect;

type StaffRow = Prisma.OrganizationMembershipGetPayload<{ select: typeof STAFF_SELECT }>;

/**
 * Center staff accounts (the spec's `staff.*`, permissions `users.*`).
 * Nobody can hand out more than they have: the role must be a staff role
 * whose permissions the caller holds, branches must be the caller's own,
 * and directors (and the caller themself) are out of reach.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly events: DomainEventPublisher,
  ) {}

  async roles(tenant: TenantContext) {
    const roles = await this.loadStaffRoles();
    return roles.map((role) => ({
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      assignable: role.permissions.every((key) => tenant.permissions.has(key)),
    }));
  }

  async list(tenant: TenantContext, query: ListStaffQueryDto) {
    if (query.branchId) assertBranchAccess(tenant, query.branchId);
    const where: Prisma.OrganizationMembershipWhereInput = {
      organizationId: tenant.organizationId,
      user: {
        deletedAt: null,
        ...(query.search && {
          OR: [
            { name: icontains(query.search) },
            { email: icontains(query.search) },
            { phone: { contains: query.search.replace(/[\s\-()]/g, '') } },
          ],
        }),
      },
      ...(query.branchId && {
        OR: [{ allBranches: true }, { branches: { some: { branchId: query.branchId } } }],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.organizationMembership.findMany({
        where,
        orderBy: [{ user: { name: query.sortOrder === 'desc' ? 'desc' : 'asc' } }, { id: 'asc' }],
        ...pageArgs(query),
        select: STAFF_SELECT,
      }),
      this.prisma.organizationMembership.count({ where }),
    ]);
    return new Paginated(rows.map(toDto), total, query);
  }

  async create(tenant: TenantContext, dto: CreateStaffDto) {
    const roleId = await this.assignableRoleId(tenant, dto.roleKey);
    const branchIds = await this.assignableBranches(tenant, dto.allBranches, dto.branchIds);
    const granted = this.assignableGrants(tenant, dto.grantedPermissions);
    const email = dto.email ? normalizeEmail(dto.email) : null;
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    const existing = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      select: { id: true },
    });
    const temporaryPassword = existing
      ? null
      : (dto.temporaryPassword ?? generateTemporaryPassword());
    const passwordHash = temporaryPassword ? await this.passwords.hash(temporaryPassword) : null;

    let membershipId: string;
    try {
      membershipId = await this.prisma.$transaction(async (tx) => {
        const userId =
          existing?.id ??
          (
            await tx.user.create({
              data: {
                name: dto.name.trim(),
                email,
                phone,
                passwordHash: passwordHash!,
                mustChangePassword: true,
              },
              select: { id: true },
            })
          ).id;
        const membership = await tx.organizationMembership.create({
          data: {
            userId,
            organizationId: tenant.organizationId,
            roleId,
            allBranches: branchIds === 'all',
            grantedPermissions: granted ?? [],
            status: MembershipStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (branchIds !== 'all') {
          await tx.branchMembership.createMany({
            data: branchIds.map((branchId) => ({
              membershipId: membership.id,
              branchId,
              organizationId: tenant.organizationId,
            })),
          });
        }
        return membership.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.MEMBER_ALREADY_EXISTS,
          'This user is already a member of the center',
        );
      }
      throw error;
    }
    const member = await this.findOne(tenant, membershipId);
    this.events.publish(tenant, {
      name: DomainEventName.STAFF_CREATED,
      entityType: 'Membership',
      entityId: membershipId,
      payload: {
        userId: member.user.id,
        role: dto.roleKey,
        allBranches: branchIds === 'all',
        branchIds: branchIds === 'all' ? [] : branchIds,
        newAccount: temporaryPassword !== null,
      },
    });
    return { member, login: email ?? phone ?? '', temporaryPassword };
  }

  async update(tenant: TenantContext, id: string, dto: UpdateStaffDto) {
    const current = await this.loadEditable(tenant, id);
    const roleId = dto.roleKey ? await this.assignableRoleId(tenant, dto.roleKey) : undefined;
    const granted = this.assignableGrants(tenant, dto.grantedPermissions);
    const branchesChanged = dto.allBranches !== undefined || dto.branchIds !== undefined;
    const branchIds = branchesChanged
      ? await this.assignableBranches(
          tenant,
          dto.allBranches ?? (dto.branchIds ? false : current.allBranches),
          dto.branchIds ?? current.branches.map((b) => b.branch.id),
        )
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.update({
        where: { id },
        data: {
          roleId,
          status: dto.status,
          grantedPermissions: granted,
          ...(branchIds !== null && { allBranches: branchIds === 'all' }),
        },
      });
      if (branchIds !== null) {
        await tx.branchMembership.deleteMany({ where: { membershipId: id } });
        if (branchIds !== 'all') {
          await tx.branchMembership.createMany({
            data: branchIds.map((branchId) => ({
              membershipId: id,
              branchId,
              organizationId: tenant.organizationId,
            })),
          });
        }
      }
    });
    this.events.publish(tenant, {
      name: DomainEventName.STAFF_UPDATED,
      entityType: 'Membership',
      entityId: id,
      payload: {
        userId: current.user.id,
        ...(dto.roleKey && { role: dto.roleKey, fromRole: current.role.key }),
        ...(dto.status && { status: dto.status, fromStatus: current.status }),
        ...(granted && { grantedPermissions: granted, fromGranted: current.grantedPermissions }),
        ...(branchIds !== null && {
          allBranches: branchIds === 'all',
          branchIds: branchIds === 'all' ? [] : branchIds,
        }),
      },
    });
    return this.findOne(tenant, id);
  }

  /**
   * New temporary password for an account that belongs to this center only
   * (resetting someone who also works elsewhere would hand over that access).
   */
  async resetPassword(tenant: TenantContext, id: string) {
    const current = await this.loadEditable(tenant, id);
    const elsewhere = await this.prisma.organizationMembership.count({
      where: { userId: current.user.id, organizationId: { not: tenant.organizationId } },
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: current.user.id },
      select: { platformRole: true },
    });
    if (elsewhere > 0 || user.platformRole) {
      throw AppException.forbidden(
        ErrorCode.ROLE_NOT_ASSIGNABLE,
        'This account is also used outside the center; its owner must change the password',
      );
    }
    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.user.update({
      where: { id: current.user.id },
      data: {
        passwordHash: await this.passwords.hash(temporaryPassword),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    await this.tokens.revokeAllExcept(current.user.id, null);
    this.events.publish(tenant, {
      name: DomainEventName.STAFF_UPDATED,
      entityType: 'Membership',
      entityId: id,
      payload: { userId: current.user.id, passwordReset: true },
    });
    return {
      member: await this.findOne(tenant, id),
      login: current.user.email ?? current.user.phone ?? '',
      temporaryPassword,
    };
  }

  async findOne(tenant: TenantContext, id: string) {
    const row = await this.prisma.organizationMembership.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: STAFF_SELECT,
    });
    if (!row) throw memberNotFound();
    return toDto(row);
  }

  /** Directors and the caller's own membership can't be changed here. */
  private async loadEditable(tenant: TenantContext, id: string): Promise<StaffRow> {
    const row = await this.prisma.organizationMembership.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: STAFF_SELECT,
    });
    if (!row) throw memberNotFound();
    if (row.id === tenant.membershipId || roleTier(row.role.key) === 'DIRECTOR') {
      throw AppException.forbidden(
        ErrorCode.ROLE_NOT_ASSIGNABLE,
        'Directors and your own access are managed by the platform owner',
      );
    }
    // A member limited to some branches only manages people inside them.
    if (
      !tenant.allBranches &&
      (row.allBranches || row.branches.some((b) => !tenant.branchIds.includes(b.branch.id)))
    ) {
      throw AppException.forbidden(
        ErrorCode.BRANCH_ACCESS_DENIED,
        'This member works in branches you do not have access to',
      );
    }
    return row;
  }

  /** Only grantable permissions the caller holds themselves (undefined = unchanged). */
  private assignableGrants(
    tenant: TenantContext,
    keys: string[] | undefined,
  ): string[] | undefined {
    if (keys === undefined) return undefined;
    const unique = [...new Set(keys)];
    if (unique.some((key) => !tenant.permissions.has(key))) {
      throw AppException.forbidden(
        ErrorCode.ROLE_NOT_ASSIGNABLE,
        'You cannot grant a permission you do not have',
      );
    }
    return unique.sort();
  }

  private async assignableRoleId(tenant: TenantContext, key: string): Promise<string> {
    const role = (await this.loadStaffRoles()).find((candidate) => candidate.key === key);
    if (!role || !role.permissions.every((permission) => tenant.permissions.has(permission))) {
      throw AppException.forbidden(
        ErrorCode.ROLE_NOT_ASSIGNABLE,
        'You cannot give a role with permissions you do not have',
      );
    }
    return role.id;
  }

  private async assignableBranches(
    tenant: TenantContext,
    allBranches: boolean | undefined,
    branchIds: string[] | undefined,
  ): Promise<'all' | string[]> {
    if (allBranches) {
      if (!tenant.allBranches) {
        throw AppException.forbidden(
          ErrorCode.BRANCH_ACCESS_DENIED,
          'Only members with access to every branch can grant it',
        );
      }
      return 'all';
    }
    const ids = [...new Set(branchIds ?? [])];
    if (ids.length === 0) {
      throw AppException.badRequest(
        ErrorCode.BRANCH_CONTEXT_REQUIRED,
        'Choose at least one branch (or allBranches)',
      );
    }
    for (const id of ids) assertBranchAccess(tenant, id);
    const found = await this.prisma.branch.count({
      where: { id: { in: ids }, organizationId: tenant.organizationId, deletedAt: null },
    });
    if (found !== ids.length) {
      throw AppException.notFound(ErrorCode.BRANCH_NOT_FOUND, 'Branch not found');
    }
    return ids;
  }

  private async loadStaffRoles() {
    const roles = await this.prisma.role.findMany({
      where: { organizationId: null, key: { in: [...STAFF_ROLE_KEYS] } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });
    return roles
      .filter((role) => role.key !== SYSTEM_ROLES.DIRECTOR)
      .map((role) => ({
        ...role,
        permissions: role.permissions.map((rp) => rp.permission.key).sort(),
      }));
  }
}

const memberNotFound = (): AppException =>
  AppException.notFound(ErrorCode.MEMBER_NOT_FOUND, 'Member not found');

function toDto(row: StaffRow) {
  return {
    id: row.id,
    status: row.status,
    role: row.role.key,
    tier: roleTier(row.role.key),
    allBranches: row.allBranches,
    branches: row.branches.map((b) => b.branch),
    grantedPermissions: row.grantedPermissions,
    createdAt: row.createdAt,
    user: row.user,
  };
}

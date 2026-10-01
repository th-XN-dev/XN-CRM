import { Injectable } from '@nestjs/common';
import { MembershipStatus, type Prisma } from '@prisma/client';
import { PasswordService } from '../../auth/password.service';
import { generateTemporaryPassword } from '../../auth/temporary-password';
import { TokenService } from '../../auth/token.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEventName } from '../../common/events/domain-events';
import { DomainEventPublisher } from '../../common/events/domain-event.publisher';
import { Paginated } from '../../common/pagination/paginated';
import { pageArgs } from '../../common/pagination/pagination-query.dto';
import { icontains } from '../../common/pagination/search';
import { type AuthUser } from '../../common/types/request.types';
import { normalizeEmail, normalizePhone } from '../../common/utils/normalize';
import { isUniqueViolation } from '../../common/utils/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSIONS, type PermissionKey } from '../../permissions/permissions.catalog';
import { SYSTEM_ROLES } from '../../roles/roles.catalog';
import { RolesService } from '../../roles/roles.service';
import {
  type CreateDirectorDto,
  type DirectorAccountDto,
  type ListDirectorsQueryDto,
  type UpdateDirectorDto,
} from '../dto/director.dto';

const DIRECTOR_SELECT = {
  id: true,
  status: true,
  createdAt: true,
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
  organization: { select: { id: true, name: true, slug: true, status: true } },
  role: {
    select: {
      organizationId: true,
      permissions: { select: { permission: { select: { key: true } } } },
    },
  },
} satisfies Prisma.OrganizationMembershipSelect;

type DirectorRow = Prisma.OrganizationMembershipGetPayload<{ select: typeof DIRECTOR_SELECT }>;

/** Without these a director could not even open their center. */
const DIRECTOR_BASELINE: readonly PermissionKey[] = [
  PERMISSIONS.ORGANIZATION_READ,
  PERMISSIONS.BRANCH_READ,
  PERMISSIONS.DASHBOARD_READ,
];

/** A director account resolved before the transaction (hashing is slow; do it once). */
export interface PreparedDirector {
  existingUserId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  temporaryPassword: string | null;
  permissions: PermissionKey[] | null;
}

export interface AttachedDirector {
  membershipId: string;
  temporaryPassword: string | null;
  login: string;
}

/**
 * Directors are ordinary users with a DIRECTOR membership in one center.
 * Temporary passwords leave this service exactly once (in the response that
 * created/reset them) and are stored only as Argon2 hashes.
 */
@Injectable()
export class DirectorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly roles: RolesService,
    private readonly events: DomainEventPublisher,
  ) {}

  async list(query: ListDirectorsQueryDto) {
    const where: Prisma.OrganizationMembershipWhereInput = {
      role: { key: SYSTEM_ROLES.DIRECTOR },
      organization: { deletedAt: null },
      organizationId: query.centerId,
      ...(query.search && {
        user: {
          OR: [
            { name: icontains(query.search) },
            { email: icontains(query.search) },
            { phone: { contains: query.search.replace(/[\s\-()]/g, '') } },
          ],
        },
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.organizationMembership.findMany({
        where,
        orderBy: [{ createdAt: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: DIRECTOR_SELECT,
      }),
      this.prisma.organizationMembership.count({ where }),
    ]);
    return new Paginated(rows.map(toDto), total, query);
  }

  async findOne(id: string) {
    return toDto(await this.load(id));
  }

  async create(actor: AuthUser, dto: CreateDirectorDto) {
    const center = await this.prisma.organization.findFirst({
      where: { id: dto.centerId, deletedAt: null },
      select: { id: true },
    });
    if (!center) {
      throw AppException.notFound(ErrorCode.ORGANIZATION_NOT_FOUND, 'Center not found');
    }
    const prepared = await this.prepareAccount(dto);
    const attached = await this.prisma.$transaction((tx) => this.attach(tx, center.id, prepared));
    const credentials = await this.credentials(attached.membershipId, attached);
    this.events.publishAs(
      { organizationId: center.id, userId: actor.id },
      {
        name: DomainEventName.DIRECTOR_CREATED,
        entityType: 'Membership',
        entityId: attached.membershipId,
        payload: {
          userId: credentials.director.user.id,
          newAccount: attached.temporaryPassword !== null,
          permissions: dto.permissions ?? null,
        },
      },
    );
    return credentials;
  }

  async update(actor: AuthUser, id: string, dto: UpdateDirectorDto) {
    const director = await this.load(id);
    const scope = { organizationId: director.organization.id, userId: actor.id };

    if (dto.name !== undefined) {
      await this.prisma.user.update({ where: { id: director.user.id }, data: { name: dto.name } });
    }
    if (dto.permissions !== undefined) {
      await this.prisma.$transaction((tx) =>
        this.applyPermissions(tx, director.organization.id, dto.permissions ?? null),
      );
      this.events.publishAs(scope, {
        name: DomainEventName.DIRECTOR_PERMISSIONS_CHANGED,
        entityType: 'Membership',
        entityId: id,
        payload: { from: currentPermissions(director), to: dto.permissions ?? null },
      });
    }
    if (dto.status !== undefined && dto.status !== director.status) {
      await this.prisma.organizationMembership.update({
        where: { id },
        data: { status: dto.status },
      });
      this.events.publishAs(scope, {
        name: DomainEventName.DIRECTOR_STATUS_CHANGED,
        entityType: 'Membership',
        entityId: id,
        payload: { from: director.status, to: dto.status },
      });
    }
    return this.findOne(id);
  }

  /** New temporary password (shown once); every session of the account is signed out. */
  async resetPassword(actor: AuthUser, id: string) {
    const director = await this.load(id);
    const target = await this.prisma.user.findUniqueOrThrow({
      where: { id: director.user.id },
      select: { platformRole: true },
    });
    if (target.platformRole) {
      throw AppException.forbidden(
        ErrorCode.FORBIDDEN,
        "A platform owner's password can only be changed by its owner",
      );
    }
    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.user.update({
      where: { id: director.user.id },
      data: {
        passwordHash: await this.passwords.hash(temporaryPassword),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    await this.tokens.revokeAllExcept(director.user.id, null);
    this.events.publishAs(
      { organizationId: director.organization.id, userId: actor.id },
      {
        name: DomainEventName.DIRECTOR_PASSWORD_RESET,
        entityType: 'Membership',
        entityId: id,
        payload: { userId: director.user.id },
      },
    );
    return this.credentials(id, {
      temporaryPassword,
      login: director.user.email ?? director.user.phone ?? '',
    });
  }

  /** Looks the login up and hashes a (given or generated) temporary password for a new account. */
  async prepareAccount(dto: DirectorAccountDto): Promise<PreparedDirector> {
    const email = dto.email ? normalizeEmail(dto.email) : null;
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    const existing = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      select: { id: true },
    });
    if (existing) {
      return {
        existingUserId: existing.id,
        name: dto.name,
        email,
        phone,
        passwordHash: null,
        temporaryPassword: null,
        permissions: dto.permissions ?? null,
      };
    }
    const temporaryPassword = dto.temporaryPassword ?? generateTemporaryPassword();
    return {
      existingUserId: null,
      name: dto.name,
      email,
      phone,
      passwordHash: await this.passwords.hash(temporaryPassword),
      temporaryPassword,
      permissions: dto.permissions ?? null,
    };
  }

  /** Inside the caller's transaction: account (if new) + DIRECTOR membership with every branch. */
  async attach(
    tx: Prisma.TransactionClient,
    organizationId: string,
    prepared: PreparedDirector,
  ): Promise<AttachedDirector> {
    let userId = prepared.existingUserId;
    if (!userId) {
      try {
        const user = await tx.user.create({
          data: {
            name: prepared.name.trim(),
            email: prepared.email,
            phone: prepared.phone,
            passwordHash: prepared.passwordHash!,
            mustChangePassword: true,
          },
          select: { id: true },
        });
        userId = user.id;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw AppException.conflict(
            ErrorCode.USER_ALREADY_EXISTS,
            'A user with this email or phone already exists',
          );
        }
        throw error;
      }
    }
    const roleId = await this.directorRoleId(tx, organizationId);
    try {
      const membership = await tx.organizationMembership.create({
        data: {
          userId,
          organizationId,
          roleId,
          allBranches: true,
          status: MembershipStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (prepared.permissions)
        await this.applyPermissions(tx, organizationId, prepared.permissions);
      return {
        membershipId: membership.id,
        temporaryPassword: prepared.temporaryPassword,
        login: prepared.email ?? prepared.phone ?? '',
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.MEMBER_ALREADY_EXISTS,
          'This user is already a member of the center',
        );
      }
      throw error;
    }
  }

  async credentials(membershipId: string, attached: Omit<AttachedDirector, 'membershipId'>) {
    return {
      director: await this.findOne(membershipId),
      login: attached.login,
      temporaryPassword: attached.temporaryPassword,
    };
  }

  /**
   * A center's directors share one permission set: the system DIRECTOR role
   * (everything), or a center-specific DIRECTOR role holding the chosen keys.
   */
  private async applyPermissions(
    tx: Prisma.TransactionClient,
    organizationId: string,
    permissions: PermissionKey[] | null,
  ): Promise<void> {
    const roleId = permissions
      ? await this.upsertCustomRole(tx, organizationId, permissions)
      : await this.roles.getSystemRoleId(SYSTEM_ROLES.DIRECTOR);
    await tx.organizationMembership.updateMany({
      where: { organizationId, role: { key: SYSTEM_ROLES.DIRECTOR } },
      data: { roleId },
    });
    if (!permissions) {
      await tx.role.deleteMany({ where: { organizationId, key: SYSTEM_ROLES.DIRECTOR } });
    }
  }

  private async upsertCustomRole(
    tx: Prisma.TransactionClient,
    organizationId: string,
    permissions: PermissionKey[],
  ): Promise<string> {
    const keys = [...new Set([...DIRECTOR_BASELINE, ...permissions])];
    const role = await tx.role.upsert({
      where: { organizationId_key: { organizationId, key: SYSTEM_ROLES.DIRECTOR } },
      create: {
        organizationId,
        key: SYSTEM_ROLES.DIRECTOR,
        name: 'Director',
        description: 'Director with a center-specific permission set chosen by the platform owner.',
      },
      update: {},
      select: { id: true },
    });
    const ids = await tx.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({
      data: ids.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    });
    return role.id;
  }

  /** The center's current director role (custom if one exists, else the system role). */
  private async directorRoleId(tx: Prisma.TransactionClient, organizationId: string) {
    const custom = await tx.role.findFirst({
      where: { organizationId, key: SYSTEM_ROLES.DIRECTOR },
      select: { id: true },
    });
    return custom?.id ?? this.roles.getSystemRoleId(SYSTEM_ROLES.DIRECTOR);
  }

  private async load(id: string): Promise<DirectorRow> {
    const row = await this.prisma.organizationMembership.findFirst({
      where: { id, role: { key: SYSTEM_ROLES.DIRECTOR }, organization: { deletedAt: null } },
      select: DIRECTOR_SELECT,
    });
    if (!row) throw AppException.notFound(ErrorCode.DIRECTOR_NOT_FOUND, 'Director not found');
    return row;
  }
}

function currentPermissions(row: DirectorRow): string[] | null {
  return row.role.organizationId === null
    ? null
    : row.role.permissions.map((rp) => rp.permission.key).sort();
}

function toDto(row: DirectorRow) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    user: row.user,
    center: row.organization,
    permissions: currentPermissions(row),
  };
}

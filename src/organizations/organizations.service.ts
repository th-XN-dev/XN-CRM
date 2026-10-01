import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { MembershipStatus, type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { ErrorCode } from '../common/errors/error-codes';
import { isRecordNotFound, isUniqueViolation } from '../common/utils/prisma-errors';
import { slugify } from '../common/utils/slug';
import { PrismaService } from '../database/prisma.service';
import {
  centerAvailability,
  LISTED_CENTER_WHERE,
  USABLE_BRANCH_WHERE,
} from '../platform/center-availability';
import { seedLeadDefaults } from '../leads/leads.defaults';
import { roleTier, SYSTEM_ROLES } from '../roles/roles.catalog';
import { RolesService } from '../roles/roles.service';
import { type TenantContext } from '../tenancy/tenant-context';
import { type CreateOrganizationDto } from './dto/create-organization.dto';
import { type ListMembersQueryDto } from './dto/member.dto';
import { type UpdateOrganizationDto } from './dto/update-organization.dto';

export const ORGANIZATION_SELECT = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  phone: true,
  email: true,
  address: true,
  timezone: true,
  currency: true,
  faviconUrl: true,
  primaryColor: true,
  secondaryColor: true,
  language: true,
  status: true,
  activeFrom: true,
  activeUntil: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationSelect;

const MAX_SLUG_ATTEMPTS = 5;

const BRAND_FIELDS = ['name', 'logoUrl', 'faviconUrl', 'primaryColor', 'secondaryColor'] as const;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    private readonly events: DomainEventPublisher,
  ) {}

  /** Self-service: creates a center and makes the creator its DIRECTOR (all branches), atomically. */
  async create(userId: string, dto: CreateOrganizationDto) {
    const directorRoleId = await this.roles.getSystemRoleId(SYSTEM_ROLES.DIRECTOR);
    const { setup: _none, ...organization } = await this.createCenter(
      { ...dto },
      userId,
      async (tx, created) => {
        await tx.organizationMembership.create({
          data: {
            userId,
            organizationId: created.id,
            roleId: directorRoleId,
            allBranches: true,
            status: MembershipStatus.ACTIVE,
          },
        });
      },
    );
    return organization;
  }

  /**
   * Creates a center with its CRM defaults; `setup` runs in the same
   * transaction (e.g. the director account), so a failure leaves nothing behind.
   * A user-chosen slug is never altered; a generated one gets a random suffix
   * on collision.
   */
  async createCenter<T = void>(
    data: Omit<Prisma.OrganizationUncheckedCreateInput, 'slug' | 'ownerId'> & { slug?: string },
    ownerId: string,
    setup?: (tx: Prisma.TransactionClient, organization: { id: string }) => Promise<T>,
  ) {
    const baseSlug = data.slug ?? slugify(data.name);
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug =
        attempt === 0 ? baseSlug : `${baseSlug.slice(0, 73)}-${randomBytes(3).toString('hex')}`;
      try {
        return await this.prisma.$transaction(async (tx) => {
          const organization = await tx.organization.create({
            data: { ...data, slug, ownerId },
            select: ORGANIZATION_SELECT,
          });
          const extra = setup ? await setup(tx, organization) : (undefined as T);
          // Seed CRM defaults (lead sources + default pipeline/stages) so the
          // sales funnel is ready to use and fully editable per center.
          await seedLeadDefaults(tx, organization.id);
          return Object.assign(organization, { setup: extra });
        });
      } catch (error) {
        if (!isUniqueViolation(error, 'slug')) throw error;
        if (data.slug) throw slugTaken();
      }
    }
    throw slugTaken();
  }

  /**
   * Center selector: every non-archived center the user is an active member
   * of; `availability` tells the UI which ones can be opened right now.
   */
  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        organization: LISTED_CENTER_WHERE,
      },
      orderBy: { organization: { name: 'asc' } },
      select: {
        allBranches: true,
        role: { select: { key: true, name: true } },
        organization: { select: ORGANIZATION_SELECT },
      },
    });
    return memberships.map(({ organization, role, allBranches }) => ({
      ...organization,
      availability: centerAvailability(organization),
      membership: { role, allBranches },
    }));
  }

  /**
   * Everything the client needs after choosing an organization: branding, the
   * caller's role and permissions, and the branches they may work in. The API
   * still authorizes every request on its own — this only drives the UI.
   */
  async context(tenant: TenantContext) {
    const [organization, branches] = await Promise.all([
      this.prisma.organization.findFirst({
        where: { id: tenant.organizationId, deletedAt: null },
        select: ORGANIZATION_SELECT,
      }),
      this.prisma.branch.findMany({
        where: {
          organizationId: tenant.organizationId,
          ...USABLE_BRANCH_WHERE,
          ...(!tenant.allBranches && { id: { in: [...tenant.branchIds] } }),
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, subCenterId: true },
      }),
    ]);
    if (!organization) throw organizationNotFound();
    return {
      organization,
      membership: {
        role: tenant.role.key,
        /** DIRECTOR runs the center; everyone else is STAFF with granular permissions. */
        tier: roleTier(tenant.role.key),
        permissions: [...tenant.permissions].sort(),
        allBranches: tenant.allBranches,
      },
      branches,
    };
  }

  /** Active members, by name. Contact details stay private. */
  async members(tenant: TenantContext, query: ListMembersQueryDto) {
    const rows = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: tenant.organizationId,
        status: MembershipStatus.ACTIVE,
        user: { deletedAt: null },
        ...(query.branchId && {
          OR: [{ allBranches: true }, { branches: { some: { branchId: query.branchId } } }],
        }),
      },
      orderBy: { user: { name: 'asc' } },
      select: {
        allBranches: true,
        role: { select: { key: true } },
        user: { select: { id: true, name: true } },
        branches: { select: { branchId: true } },
      },
    });
    return rows.map((row) => ({
      userId: row.user.id,
      name: row.user.name,
      role: row.role.key,
      allBranches: row.allBranches,
      branchIds: row.branches.map((branch) => branch.branchId),
    }));
  }

  async findOne(tenant: TenantContext) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: tenant.organizationId, deletedAt: null },
      select: ORGANIZATION_SELECT,
    });
    if (!organization) throw organizationNotFound();

    return {
      ...organization,
      membership: {
        role: tenant.role.key,
        permissions: [...tenant.permissions].sort(),
        allBranches: tenant.allBranches,
      },
    };
  }

  /** The director's center settings. Lifecycle and the activation period stay with the owner. */
  async update(tenant: TenantContext, dto: UpdateOrganizationDto) {
    try {
      const updated = await this.prisma.organization.update({
        where: { id: tenant.organizationId, deletedAt: null },
        data: dto,
        select: ORGANIZATION_SELECT,
      });
      const fields = Object.keys(dto).filter(
        (key) => dto[key as keyof UpdateOrganizationDto] !== undefined,
      );
      const brand = Object.fromEntries(
        BRAND_FIELDS.filter((key) => dto[key] !== undefined).map((key) => [key, dto[key]]),
      );
      this.events.publish(tenant, {
        name: DomainEventName.CENTER_UPDATED,
        entityType: 'Center',
        entityId: tenant.organizationId,
        payload: { fields },
      });
      if (Object.keys(brand).length > 0) {
        this.events.publish(tenant, {
          name: DomainEventName.BRAND_SETTINGS_CHANGED,
          entityType: 'Center',
          entityId: tenant.organizationId,
          payload: brand,
        });
      }
      return updated;
    } catch (error) {
      if (isUniqueViolation(error, 'slug')) throw slugTaken();
      if (isRecordNotFound(error)) {
        throw organizationNotFound();
      }
      throw error;
    }
  }
}

export const slugTaken = (): AppException =>
  AppException.conflict(
    ErrorCode.ORGANIZATION_SLUG_TAKEN,
    'This organization slug is already taken',
  );

export const organizationNotFound = (): AppException =>
  AppException.notFound(ErrorCode.ORGANIZATION_NOT_FOUND, 'Organization not found');

import { Injectable } from '@nestjs/common';
import { MembershipStatus, type PlatformRole, type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { normalizeEmail, normalizePhone } from '../common/utils/normalize';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import {
  centerAvailability,
  CENTER_LIFECYCLE_SELECT,
  LISTED_CENTER_WHERE,
} from '../platform/center-availability';

/** Public user shape. `passwordHash` is never selected into API responses. */
export const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof PUBLIC_USER_SELECT }>;

export interface CreateUserInput {
  name: string;
  email?: string;
  phone?: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput): Promise<PublicUser> {
    try {
      return await this.prisma.user.create({
        data: {
          name: input.name.trim(),
          email: input.email ? normalizeEmail(input.email) : null,
          phone: input.phone ? normalizePhone(input.phone) : null,
          passwordHash: input.passwordHash,
        },
        select: PUBLIC_USER_SELECT,
      });
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

  /** `login` is an email (contains "@") or a phone number. Only active, non-deleted users. */
  findForLogin(login: string): Promise<(PublicUser & { passwordHash: string }) | null> {
    const where: Prisma.UserWhereInput = login.includes('@')
      ? { email: normalizeEmail(login) }
      : { phone: normalizePhone(login) };
    return this.prisma.user.findFirst({
      where: { ...where, isActive: true, deletedAt: null },
      select: { ...PUBLIC_USER_SELECT, passwordHash: true },
    });
  }

  /** What every authenticated request needs to know about its user (null → no access). */
  authState(
    id: string,
  ): Promise<{ platformRole: PlatformRole | null; mustChangePassword: boolean } | null> {
    return this.prisma.user.findFirst({
      where: { id, isActive: true, deletedAt: null },
      select: { platformRole: true, mustChangePassword: true },
    });
  }

  async isActive(id: string): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { id, isActive: true, deletedAt: null } });
    return count > 0;
  }

  /** Why a member can't use any of their centers (null when at least one is usable or they have none). */
  async blockedCenterReason(id: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: id, status: MembershipStatus.ACTIVE, organization: LISTED_CENTER_WHERE },
      select: { organization: { select: CENTER_LIFECYCLE_SELECT } },
    });
    const availabilities = memberships.map((m) => centerAvailability(m.organization));
    if (availabilities.length === 0 || availabilities.includes('ACTIVE')) return null;
    return availabilities[0] as Exclude<(typeof availabilities)[number], 'ACTIVE'>;
  }

  async findWithPassword(id: string) {
    return this.prisma.user.findFirst({
      where: { id, isActive: true, deletedAt: null },
      select: { ...PUBLIC_USER_SELECT, passwordHash: true, platformRole: true },
    });
  }

  async updateProfile(
    id: string,
    data: { name?: string; email?: string; phone?: string },
  ): Promise<PublicUser> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          name: data.name?.trim(),
          email: data.email === undefined ? undefined : normalizeEmail(data.email),
          phone: data.phone === undefined ? undefined : normalizePhone(data.phone),
        },
        select: PUBLIC_USER_SELECT,
      });
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

  async setPassword(id: string, passwordHash: string, temporary: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: temporary,
        passwordChangedAt: new Date(),
      },
    });
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  /**
   * Profile + memberships — enough for the frontend to decide owner area,
   * onboarding or center selector. Frozen/expired centers are listed with
   * `availability`, so the UI can say why they can't be opened.
   */
  async getProfile(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, isActive: true, deletedAt: null },
      select: {
        ...PUBLIC_USER_SELECT,
        platformRole: true,
        mustChangePassword: true,
        memberships: {
          where: { status: MembershipStatus.ACTIVE, organization: LISTED_CENTER_WHERE },
          orderBy: { createdAt: 'asc' },
          select: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
                primaryColor: true,
                ...CENTER_LIFECYCLE_SELECT,
              },
            },
            role: { select: { key: true, name: true } },
          },
        },
      },
    });
    if (!user) throw AppException.unauthorized();

    const { memberships, ...profile } = user;
    return {
      ...profile,
      organizations: memberships.map(({ organization, role }) => {
        const {
          status: _s,
          activeFrom: _f,
          activeUntil: _u,
          timezone: _t,
          ...center
        } = organization;
        return { ...center, role, availability: centerAvailability(organization) };
      }),
    };
  }
}

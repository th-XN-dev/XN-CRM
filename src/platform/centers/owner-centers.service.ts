import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CenterStatus, MembershipStatus, type Prisma, StudentStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEventName } from '../../common/events/domain-events';
import { DomainEventPublisher } from '../../common/events/domain-event.publisher';
import { Paginated } from '../../common/pagination/paginated';
import { pageArgs } from '../../common/pagination/pagination-query.dto';
import { icontains } from '../../common/pagination/search';
import { parseDateOnly } from '../../common/utils/dates';
import { isRecordNotFound, isUniqueViolation } from '../../common/utils/prisma-errors';
import { type EnvironmentVariables } from '../../config/env.validation';
import { PrismaService } from '../../database/prisma.service';
import {
  ORGANIZATION_SELECT,
  OrganizationsService,
  slugTaken,
} from '../../organizations/organizations.service';
import { SYSTEM_ROLES } from '../../roles/roles.catalog';
import { type AuthUser } from '../../common/types/request.types';
import { centerAvailability } from '../center-availability';
import { DirectorsService } from '../directors/directors.service';
import {
  type ActivateCenterDto,
  type CreateCenterDto,
  type FreezeCenterDto,
  type ListCentersQueryDto,
  type UpdateCenterDto,
} from '../dto/center.dto';

const CENTER_SELECT = {
  ...ORGANIZATION_SELECT,
  statusChangedAt: true,
  _count: {
    select: {
      subCenters: { where: { status: { not: CenterStatus.ARCHIVED } } },
      branches: { where: { deletedAt: null } },
      memberships: { where: { status: MembershipStatus.ACTIVE } },
      students: { where: { status: StudentStatus.ACTIVE } },
    },
  },
  memberships: {
    where: { role: { key: SYSTEM_ROLES.DIRECTOR } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      status: true,
      user: { select: { id: true, name: true, mustChangePassword: true } },
    },
  },
} satisfies Prisma.OrganizationSelect;

type CenterRow = Prisma.OrganizationGetPayload<{ select: typeof CENTER_SELECT }>;

const BRAND_FIELDS = ['name', 'logoUrl', 'faviconUrl', 'primaryColor', 'secondaryColor'] as const;

/**
 * The platform owner's view of centers (organizations). Lifecycle changes
 * are status changes — a center and its financial history are never deleted.
 */
@Injectable()
export class OwnerCentersService {
  private readonly urlTemplate: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly directors: DirectorsService,
    private readonly events: DomainEventPublisher,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.urlTemplate = config.get('CENTER_URL_TEMPLATE', { infer: true });
  }

  async list(query: ListCentersQueryDto) {
    const where: Prisma.OrganizationWhereInput = {
      deletedAt: null,
      status: query.status,
      ...(query.search && {
        OR: [{ name: icontains(query.search) }, { slug: icontains(query.search) }],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: CENTER_SELECT,
      }),
      this.prisma.organization.count({ where }),
    ]);
    return new Paginated(
      rows.map((row) => this.toDto(row)),
      total,
      query,
    );
  }

  async findOne(id: string) {
    return this.toDto(await this.load(id));
  }

  /** Center + (optionally) its director account, in one transaction. */
  async create(actor: AuthUser, dto: CreateCenterDto) {
    const { director, activeFrom, activeUntil, ...profile } = dto;
    assertPeriod(activeFrom, activeUntil);
    const prepared = director ? await this.directors.prepareAccount(director) : null;

    const created = await this.organizations.createCenter(
      {
        ...profile,
        activeFrom: activeFrom ? parseDateOnly(activeFrom) : null,
        activeUntil: activeUntil ? parseDateOnly(activeUntil) : null,
      },
      actor.id,
      (tx, organization) =>
        prepared ? this.directors.attach(tx, organization.id, prepared) : Promise.resolve(null),
    );

    const scope = { organizationId: created.id, userId: actor.id };
    this.events.publishAs(scope, {
      name: DomainEventName.CENTER_CREATED,
      entityType: 'Center',
      entityId: created.id,
      payload: { name: created.name, slug: created.slug, activeFrom, activeUntil },
    });
    const credentials = created.setup
      ? await this.directors.credentials(created.setup.membershipId, created.setup)
      : null;
    if (credentials) {
      this.events.publishAs(scope, {
        name: DomainEventName.DIRECTOR_CREATED,
        entityType: 'Membership',
        entityId: credentials.director.id,
        payload: {
          userId: credentials.director.user.id,
          newAccount: credentials.temporaryPassword !== null,
          permissions: director?.permissions ?? null,
        },
      });
    }
    return { center: await this.findOne(created.id), director: credentials };
  }

  async update(actor: AuthUser, id: string, dto: UpdateCenterDto) {
    const before = await this.load(id);
    const activeFrom = dto.activeFrom === undefined ? undefined : dto.activeFrom;
    const activeUntil = dto.activeUntil === undefined ? undefined : dto.activeUntil;
    assertPeriod(
      activeFrom === undefined ? ymdOrNull(before.activeFrom) : activeFrom,
      activeUntil === undefined ? ymdOrNull(before.activeUntil) : activeUntil,
    );
    try {
      await this.prisma.organization.update({
        where: { id, deletedAt: null },
        data: {
          ...dto,
          activeFrom:
            activeFrom === undefined ? undefined : activeFrom && parseDateOnly(activeFrom),
          activeUntil:
            activeUntil === undefined ? undefined : activeUntil && parseDateOnly(activeUntil),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'slug')) throw slugTaken();
      if (isRecordNotFound(error)) throw centerNotFound();
      throw error;
    }
    const scope = { organizationId: id, userId: actor.id };
    const changed = Object.keys(dto).filter(
      (key) => dto[key as keyof UpdateCenterDto] !== undefined,
    );
    this.events.publishAs(scope, {
      name: DomainEventName.CENTER_UPDATED,
      entityType: 'Center',
      entityId: id,
      payload: { fields: changed, ...pick(dto, ['name', 'slug', 'activeFrom', 'activeUntil']) },
    });
    if (BRAND_FIELDS.some((field) => dto[field] !== undefined)) {
      this.events.publishAs(scope, {
        name: DomainEventName.BRAND_SETTINGS_CHANGED,
        entityType: 'Center',
        entityId: id,
        payload: pick(dto, BRAND_FIELDS),
      });
    }
    return this.findOne(id);
  }

  /** ACTIVE → FROZEN: members are locked out (reads and writes); data stays. */
  async freeze(actor: AuthUser, id: string, dto: FreezeCenterDto) {
    const center = await this.load(id);
    if (center.status !== CenterStatus.ACTIVE) throw invalidTransition(center.status, 'FROZEN');
    await this.setStatus(id, CenterStatus.FROZEN);
    this.events.publishAs(
      { organizationId: id, userId: actor.id },
      {
        name: DomainEventName.CENTER_FROZEN,
        entityType: 'Center',
        entityId: id,
        payload: { from: center.status, to: CenterStatus.FROZEN, reason: dto.reason ?? null },
      },
    );
    return this.findOne(id);
  }

  /**
   * FROZEN/ARCHIVED → ACTIVE. A period that has already ended must be
   * extended in the same call, otherwise the center would be closed again.
   */
  async activate(actor: AuthUser, id: string, dto: ActivateCenterDto) {
    const center = await this.load(id);
    if (center.status === CenterStatus.ACTIVE) throw invalidTransition(center.status, 'ACTIVE');
    const activeUntil = dto.activeUntil ? parseDateOnly(dto.activeUntil) : center.activeUntil;
    assertPeriod(ymdOrNull(center.activeFrom), ymdOrNull(activeUntil));
    const after = centerAvailability({ ...center, status: CenterStatus.ACTIVE, activeUntil });
    if (after === 'EXPIRED') {
      throw AppException.badRequest(
        ErrorCode.CENTER_PERIOD_ENDED,
        'The activation period has ended; send a new activeUntil to activate the center',
      );
    }
    await this.setStatus(id, CenterStatus.ACTIVE, { activeUntil });
    this.events.publishAs(
      { organizationId: id, userId: actor.id },
      {
        name: DomainEventName.CENTER_ACTIVATED,
        entityType: 'Center',
        entityId: id,
        payload: { from: center.status, to: CenterStatus.ACTIVE, activeUntil: dto.activeUntil },
      },
    );
    return this.findOne(id);
  }

  /** → ARCHIVED: hidden from members' center lists; history and finances are kept. */
  async archive(actor: AuthUser, id: string) {
    const center = await this.load(id);
    if (center.status === CenterStatus.ARCHIVED) throw invalidTransition(center.status, 'ARCHIVED');
    await this.setStatus(id, CenterStatus.ARCHIVED);
    this.events.publishAs(
      { organizationId: id, userId: actor.id },
      {
        name: DomainEventName.CENTER_ARCHIVED,
        entityType: 'Center',
        entityId: id,
        payload: { from: center.status, to: CenterStatus.ARCHIVED },
      },
    );
    return this.findOne(id);
  }

  private async setStatus(
    id: string,
    status: CenterStatus,
    extra: Prisma.OrganizationUpdateInput = {},
  ): Promise<void> {
    await this.prisma.organization.update({
      where: { id },
      data: { ...extra, status, statusChangedAt: new Date() },
    });
  }

  private async load(id: string): Promise<CenterRow> {
    const center = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      select: CENTER_SELECT,
    });
    if (!center) throw centerNotFound();
    return center;
  }

  private toDto(row: CenterRow) {
    const { _count, memberships, ...center } = row;
    return {
      ...center,
      availability: centerAvailability(center),
      accessUrl: this.urlTemplate ? this.urlTemplate.replace('{slug}', center.slug) : null,
      counts: {
        subCenters: _count.subCenters,
        branches: _count.branches,
        members: _count.memberships,
        activeStudents: _count.students,
      },
      directors: memberships
        .filter((m) => m.status === MembershipStatus.ACTIVE)
        .map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          mustChangePassword: m.user.mustChangePassword,
        })),
    };
  }
}

export const centerNotFound = (): AppException =>
  AppException.notFound(ErrorCode.ORGANIZATION_NOT_FOUND, 'Center not found');

const invalidTransition = (from: string, to: string): AppException =>
  AppException.conflict(
    ErrorCode.INVALID_STATUS_TRANSITION,
    `A ${from.toLowerCase()} center can't become ${to.toLowerCase()}`,
  );

function assertPeriod(from: string | null | undefined, until: string | null | undefined): void {
  if (from && until && from > until) {
    throw AppException.badRequest(
      ErrorCode.INVALID_DATE_RANGE,
      'activeFrom must not be after activeUntil',
    );
  }
}

const ymdOrNull = (date: Date | null): string | null =>
  date ? date.toISOString().slice(0, 10) : null;

function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]) {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

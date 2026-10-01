import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { type EventContext } from '../common/events/domain-events';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { dayRangeFilter } from '../common/utils/date-range';
import { PrismaService } from '../database/prisma.service';
import { assertBranchAccess, restrictedBranchIds } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { sanitizeForAudit } from './audit-sanitizer';
import { type ListAuditLogsQueryDto } from './dto/audit-log.dto';

export interface AuditEntry {
  organizationId: string | null;
  branchId?: string | null;
  userId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  context?: Partial<EventContext>;
}

const MANAGEMENT_ACTION_PREFIXES = [
  'CENTER_',
  'DIRECTOR_',
  'SUB_CENTER_',
  'BRANCH_',
  'BRAND_SETTINGS_',
  'STAFF_',
];

const AUDIT_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  userId: true,
  action: true,
  entityType: true,
  entityId: true,
  oldData: true,
  newData: true,
  ipAddress: true,
  userAgent: true,
  requestId: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

/**
 * Writes and reads the append-only audit trail. There is deliberately no
 * update or delete here (and the database rejects both).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        branchId: entry.branchId ?? null,
        userId: entry.userId,
        action: entry.action.slice(0, 64),
        entityType: entry.entityType?.slice(0, 64) ?? null,
        entityId: entry.entityId?.slice(0, 64) ?? null,
        oldData: json(entry.oldData),
        newData: json(entry.newData),
        ipAddress: entry.context?.ipAddress?.slice(0, 64) ?? null,
        userAgent: entry.context?.userAgent?.slice(0, 500) ?? null,
        requestId: entry.context?.requestId ?? null,
      },
    });
  }

  async list(tenant: TenantContext, query: ListAuditLogsQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        visibleWhere(tenant),
        {
          userId: query.userId,
          action: query.action,
          entityType: query.entityType,
          entityId: query.entityId,
          createdAt: dayRangeFilter(query, tenant.timezone),
        },
        query.branchId ? { branchId: requestedBranch(tenant, query.branchId) } : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
        select: AUDIT_SELECT,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return new Paginated(await this.withUsers(items), total, query);
  }

  /**
   * The management trail for the platform owner: lifecycle, director,
   * sub-center, branch, brand and staff actions of every center (never the
   * centers' day-to-day CRM records).
   */
  async listManagement(query: { centerId?: string; page: number; limit: number }) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: query.centerId ?? { not: null },
      OR: MANAGEMENT_ACTION_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } })),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
        select: AUDIT_SELECT,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return new Paginated(await this.withUsers(items), total, query);
  }

  async findOne(tenant: TenantContext, id: string) {
    const row = await this.prisma.auditLog.findFirst({
      where: { AND: [{ id }, visibleWhere(tenant)] },
      select: AUDIT_SELECT,
    });
    if (!row) throw AppException.notFound(ErrorCode.AUDIT_LOG_NOT_FOUND, 'Audit log not found');
    const [withUser] = await this.withUsers([row]);
    return withUser;
  }

  /** Actor names in one query (audit rows have no FKs by design). */
  private async withUsers<T extends { userId: string | null }>(rows: T[]) {
    const ids = [...new Set(rows.map((row) => row.userId).filter((id): id is string => !!id))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return rows.map((row) => ({
      ...row,
      user: row.userId ? (byId.get(row.userId) ?? null) : null,
    }));
  }
}

/**
 * Own organization only; members limited to some branches see organization-wide
 * rows plus rows of their branches.
 */
function visibleWhere(tenant: TenantContext): Prisma.AuditLogWhereInput {
  const restricted = restrictedBranchIds(tenant);
  return {
    organizationId: tenant.organizationId,
    ...(restricted && { OR: [{ branchId: null }, { branchId: { in: restricted } }] }),
  };
}

function requestedBranch(tenant: TenantContext, branchId: string): string {
  assertBranchAccess(tenant, branchId);
  return branchId;
}

/** Json? column: sanitized value, or undefined → SQL NULL. */
function json(value: unknown): Prisma.InputJsonValue | undefined {
  const clean = sanitizeForAudit(value);
  return clean === null ? undefined : clean;
}

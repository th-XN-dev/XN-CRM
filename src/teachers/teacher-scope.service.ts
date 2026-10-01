import { Injectable } from '@nestjs/common';
import { type Prisma, TeacherStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../database/prisma.service';
import { type PermissionKey } from '../permissions/permissions.catalog';
import { type TenantContext } from '../tenancy/tenant-context';

/**
 * "Own groups" data scope for teachers.
 *
 * Routes accept a full permission (e.g. `groups.read`) or its `*_own` variant.
 * With the full one the caller sees everything their branches allow; with only
 * the own variant they see groups whose primary teacher is their Teacher
 * profile (Teacher.userId = caller) — resolved from the database every request.
 */
@Injectable()
export class TeacherScopeService {
  /** Per-request cache: the tenant object lives exactly as long as the request. */
  private readonly ownTeacherIds = new WeakMap<TenantContext, Promise<string | null>>();

  constructor(private readonly prisma: PrismaService) {}

  /** The caller's ACTIVE teacher profile in this organization, if any. */
  ownTeacherId(tenant: TenantContext): Promise<string | null> {
    let cached = this.ownTeacherIds.get(tenant);
    if (!cached) {
      cached = this.prisma.teacher
        .findFirst({
          where: {
            organizationId: tenant.organizationId,
            userId: tenant.userId,
            status: TeacherStatus.ACTIVE,
          },
          select: { id: true },
        })
        .then((teacher) => teacher?.id ?? null);
      this.ownTeacherIds.set(tenant, cached);
    }
    return cached;
  }

  /** `null` = unrestricted; otherwise the teacher id the data must belong to (possibly none). */
  async restriction(
    tenant: TenantContext,
    full: PermissionKey,
  ): Promise<{ teacherId: string | null } | null> {
    if (tenant.permissions.has(full)) return null;
    return { teacherId: await this.ownTeacherId(tenant) };
  }

  /** Prisma filter for groups visible under `full` / its own variant. */
  async groupWhere(tenant: TenantContext, full: PermissionKey): Promise<Prisma.GroupWhereInput> {
    const restriction = await this.restriction(tenant, full);
    if (!restriction) return {};
    // No teacher profile → matches nothing.
    return restriction.teacherId ? { teacherId: restriction.teacherId } : { id: { in: [] } };
  }

  async assertGroup(
    tenant: TenantContext,
    group: { teacherId: string | null },
    full: PermissionKey,
  ): Promise<void> {
    const restriction = await this.restriction(tenant, full);
    if (restriction && (!restriction.teacherId || restriction.teacherId !== group.teacherId)) {
      throw AppException.forbidden(
        ErrorCode.GROUP_ACCESS_DENIED,
        'You can only access groups you teach',
      );
    }
  }
}

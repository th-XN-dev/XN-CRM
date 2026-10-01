import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { icontains, phoneContains, searchWhere } from '../common/pagination/search';
import { PrismaService } from '../database/prisma.service';
import {
  CURRENT_STUDENT_STATUSES,
  STUDENT_SUMMARY_SELECT,
  studentAccessWhere,
} from '../students/student.access';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { assertBranchAccess, restrictedBranchIds } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';
import { type CreateFamilyDto } from './dto/create-family.dto';
import { type ListFamiliesQueryDto } from './dto/list-families-query.dto';
import { type UpdateFamilyDto } from './dto/update-family.dto';
import { familyAccessWhere } from './family.access';

export const FAMILY_SELECT = {
  id: true,
  organizationId: true,
  primaryBranchId: true,
  name: true,
  phone: true,
  secondaryPhone: true,
  email: true,
  address: true,
  notes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FamilySelect;

export type FamilyRecord = Prisma.FamilyGetPayload<{ select: typeof FAMILY_SELECT }>;

@Injectable()
export class FamiliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly events: DomainEventPublisher,
  ) {}

  async create(tenant: TenantContext, dto: CreateFamilyDto): Promise<FamilyRecord> {
    const data = await this.prepareCreate(tenant, dto);
    const family = await this.prisma.family.create({ data, select: FAMILY_SELECT });
    this.publishCreated(tenant, family);
    return family;
  }

  /**
   * Validates input and returns create data; used directly and by the
   * student+family flow, which inserts it inside its own transaction.
   * Branch-restricted members must attach the family to one of their branches,
   * otherwise they could create families they can't see.
   */
  async prepareCreate(
    tenant: TenantContext,
    dto: CreateFamilyDto,
    fallbackBranchId?: string,
  ): Promise<Prisma.FamilyUncheckedCreateInput> {
    const { primaryBranchId: requested, ...rest } = dto;
    const candidate = requested ?? tenant.branchId ?? fallbackBranchId ?? null;
    let primaryBranchId: string | null = null;
    if (candidate || !tenant.allBranches) {
      primaryBranchId = await this.branches.resolveWritableBranch(tenant, candidate);
    }
    return { ...rest, primaryBranchId, organizationId: tenant.organizationId };
  }

  publishCreated(tenant: TenantContext, family: { id: string; name: string }): void {
    this.events.publish(tenant, {
      name: DomainEventName.FAMILY_CREATED,
      entityType: 'Family',
      entityId: family.id,
      payload: { name: family.name },
    });
  }

  async list(tenant: TenantContext, query: ListFamiliesQueryDto) {
    const where: Prisma.FamilyWhereInput = {
      AND: [
        familyAccessWhere(tenant),
        this.branchFilter(tenant, query.branchId),
        { isActive: query.isActive },
        searchWhere<Prisma.FamilyWhereInput>(query.search, (term) => [
          { name: icontains(term) },
          { phone: phoneContains(term) },
          { secondaryPhone: phoneContains(term) },
          { email: icontains(term) },
        ]) ?? {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.family.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: {
          ...FAMILY_SELECT,
          _count: { select: { students: { where: studentAccessWhere(tenant) } } },
        },
      }),
      this.prisma.family.count({ where }),
    ]);
    return new Paginated(
      items.map(({ _count, ...family }) => ({ ...family, studentsCount: _count.students })),
      total,
      query,
    );
  }

  /** Family plus the students of it the caller may see. */
  async findOne(tenant: TenantContext, id: string) {
    const family = await this.getAccessible(tenant, id);
    const students = await this.prisma.student.findMany({
      where: { ...studentAccessWhere(tenant), familyId: id },
      orderBy: [{ birthDate: 'asc' }, { firstName: 'asc' }],
      select: STUDENT_SUMMARY_SELECT,
    });
    return { family, students };
  }

  async update(tenant: TenantContext, id: string, dto: UpdateFamilyDto): Promise<FamilyRecord> {
    await this.getAccessible(tenant, id);
    const { isActive, primaryBranchId, ...rest } = dto;
    if (primaryBranchId) await this.branches.assertWritableBranch(tenant, primaryBranchId);
    if (primaryBranchId === null && !tenant.allBranches) {
      throw AppException.badRequest(
        ErrorCode.BRANCH_CONTEXT_REQUIRED,
        'primaryBranchId is required',
      );
    }
    if (isActive === false) await this.assertNoCurrentStudents(id);

    return this.prisma.family.update({
      where: { id, organizationId: tenant.organizationId },
      data: { ...rest, primaryBranchId, isActive },
      select: FAMILY_SELECT,
    });
  }

  /** Soft delete: families are never removed, only deactivated. */
  async deactivate(tenant: TenantContext, id: string): Promise<FamilyRecord> {
    await this.getAccessible(tenant, id);
    await this.assertNoCurrentStudents(id);
    return this.prisma.family.update({
      where: { id, organizationId: tenant.organizationId },
      data: { isActive: false },
      select: FAMILY_SELECT,
    });
  }

  /** 404 when outside the organization, 403 when in it but outside the caller's branches. */
  async getAccessible(tenant: TenantContext, id: string): Promise<FamilyRecord> {
    const family = await this.prisma.family.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: FAMILY_SELECT,
    });
    if (!family) throw AppException.notFound(ErrorCode.FAMILY_NOT_FOUND, 'Family not found');

    const restricted = restrictedBranchIds(tenant);
    if (restricted) {
      const visible = await this.prisma.family.count({
        where: { id, ...familyAccessWhere(tenant) },
      });
      if (!visible) {
        throw AppException.forbidden(
          ErrorCode.BRANCH_ACCESS_DENIED,
          'You do not have access to this family',
        );
      }
    }
    return family;
  }

  private branchFilter(tenant: TenantContext, requested?: string): Prisma.FamilyWhereInput {
    if (requested) {
      assertBranchAccess(tenant, requested);
      return { primaryBranchId: requested };
    }
    if (tenant.branchId) {
      return {
        OR: [
          { primaryBranchId: tenant.branchId },
          { students: { some: { branchId: tenant.branchId } } },
        ],
      };
    }
    return {};
  }

  private async assertNoCurrentStudents(familyId: string): Promise<void> {
    const current = await this.prisma.student.count({
      where: { familyId, status: { in: CURRENT_STUDENT_STATUSES } },
    });
    if (current > 0) {
      throw AppException.conflict(
        ErrorCode.FAMILY_HAS_ACTIVE_STUDENTS,
        'Family has active or frozen students; change their status first',
      );
    }
  }
}

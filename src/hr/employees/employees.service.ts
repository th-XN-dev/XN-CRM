import { Injectable } from '@nestjs/common';
import { EmployeeStatus, MembershipStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEventName } from '../../common/events/domain-events';
import { DomainEventPublisher } from '../../common/events/domain-event.publisher';
import { Paginated } from '../../common/pagination/paginated';
import { pageArgs } from '../../common/pagination/pagination-query.dto';
import { icontains, phoneContains, searchWhere } from '../../common/pagination/search';
import { parseDateOnly, todayIn } from '../../common/utils/dates';
import { isUniqueViolation } from '../../common/utils/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import { lockRows } from '../../database/row-lock';
import { BranchAccessService } from '../../tenancy/branch-access.service';
import { branchListFilter, restrictedBranchIds } from '../../tenancy/branch-scope';
import { type TenantContext } from '../../tenancy/tenant-context';
import { DepartmentsService } from '../departments/departments.service';
import { PositionsService } from '../positions/positions.service';
import {
  type CreateEmployeeDto,
  type ListEmployeesQueryDto,
  type UpdateEmployeeDto,
} from './dto/employee.dto';

export const EMPLOYEE_BRANCH_SELECT = {
  id: true,
  branchId: true,
  isPrimary: true,
  createdAt: true,
  branch: { select: { id: true, name: true, code: true } },
} satisfies Prisma.EmployeeBranchSelect;

const EMPLOYEE_SELECT = {
  id: true,
  organizationId: true,
  primaryBranchId: true,
  userId: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phone: true,
  email: true,
  birthDate: true,
  hireDate: true,
  terminationDate: true,
  positionId: true,
  departmentId: true,
  status: true,
  notes: true,
  position: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true } },
  primaryBranch: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
  branches: {
    select: EMPLOYEE_BRANCH_SELECT,
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployeeSelect;

export type EmployeeRecord = Prisma.EmployeeGetPayload<{ select: typeof EMPLOYEE_SELECT }>;

/** Employees that can still be given work. */
export const ASSIGNABLE_EMPLOYEE_STATUSES: EmployeeStatus[] = [
  EmployeeStatus.ACTIVE,
  EmployeeStatus.ON_LEAVE,
];

/**
 * Employee visibility: the whole organization, or — for branch-restricted
 * members — employees who work in at least one of the caller's branches.
 */
export function employeeAccessWhere(tenant: TenantContext): Prisma.EmployeeWhereInput {
  const restricted = restrictedBranchIds(tenant);
  return {
    organizationId: tenant.organizationId,
    ...(restricted && { branches: { some: { branchId: { in: restricted } } } }),
  };
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly events: DomainEventPublisher,
    private readonly positions: PositionsService,
    private readonly departments: DepartmentsService,
  ) {}

  /** Creates the employee and its branch links in one transaction. */
  async create(tenant: TenantContext, dto: CreateEmployeeDto) {
    const primaryBranchId = await this.branches.resolveWritableBranch(tenant, dto.primaryBranchId);
    const extraBranchIds = [...new Set(dto.branchIds ?? [])].filter((id) => id !== primaryBranchId);
    for (const branchId of extraBranchIds) {
      await this.branches.assertWritableBranch(tenant, branchId);
    }
    await this.assertReferences(tenant, dto);

    const { primaryBranchId: _p, branchIds: _b, birthDate, hireDate, ...fields } = dto;
    const employee = await this.save(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.employee.create({
          data: {
            ...fields,
            organizationId: tenant.organizationId,
            primaryBranchId,
            birthDate: birthDate ? parseDateOnly(birthDate) : undefined,
            hireDate: hireDate ? parseDateOnly(hireDate) : todayIn(tenant.timezone),
          },
          select: { id: true },
        });
        await tx.employeeBranch.createMany({
          data: [primaryBranchId, ...extraBranchIds].map((branchId) => ({
            organizationId: tenant.organizationId,
            employeeId: created.id,
            branchId,
            isPrimary: branchId === primaryBranchId,
          })),
        });
        return tx.employee.findUniqueOrThrow({
          where: { id: created.id },
          select: EMPLOYEE_SELECT,
        });
      }),
    );

    this.events.publish(tenant, {
      name: DomainEventName.EMPLOYEE_CREATED,
      entityType: 'Employee',
      entityId: employee.id,
      payload: { primaryBranchId, userId: employee.userId, positionId: employee.positionId },
    });
    return employee;
  }

  async list(tenant: TenantContext, query: ListEmployeesQueryDto) {
    const branchFilter = branchListFilter(tenant, query.branchId);
    const where: Prisma.EmployeeWhereInput = {
      AND: [
        employeeAccessWhere(tenant),
        branchFilter ? { branches: { some: { branchId: branchFilter } } } : {},
        {
          status: query.status,
          positionId: query.positionId,
          departmentId: query.departmentId,
          ...(query.hasUser !== undefined && { userId: query.hasUser ? { not: null } : null }),
        },
        searchWhere<Prisma.EmployeeWhereInput>(query.search, (term) => [
          { firstName: icontains(term) },
          { lastName: icontains(term) },
          { middleName: icontains(term) },
          { email: icontains(term) },
          { phone: phoneContains(term) },
        ]) ?? {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: EMPLOYEE_SELECT,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  findOne(tenant: TenantContext, id: string) {
    return this.getAccessible(tenant, id);
  }

  async update(tenant: TenantContext, id: string, dto: UpdateEmployeeDto) {
    const current = await this.getAccessible(tenant, id);
    await this.assertReferences(tenant, dto);

    const { birthDate, hireDate, terminationDate, status, ...fields } = dto;
    const nextHire = hireDate ? parseDateOnly(hireDate) : current.hireDate;
    const nextStatus = status ?? current.status;
    const nextTermination =
      nextStatus === EmployeeStatus.TERMINATED
        ? terminationDate
          ? parseDateOnly(terminationDate)
          : (current.terminationDate ?? latest(todayIn(tenant.timezone), nextHire))
        : null;
    if (nextTermination && nextTermination < nextHire) {
      throw AppException.badRequest(
        ErrorCode.INVALID_DATE_RANGE,
        'terminationDate must not be before hireDate',
      );
    }

    const employee = await this.save(() =>
      this.prisma.employee.update({
        where: { id, organizationId: tenant.organizationId },
        data: {
          ...fields,
          status,
          birthDate: birthDate ? parseDateOnly(birthDate) : undefined,
          hireDate: hireDate ? parseDateOnly(hireDate) : undefined,
          terminationDate: nextTermination,
        },
        select: EMPLOYEE_SELECT,
      }),
    );

    const terminated =
      current.status !== EmployeeStatus.TERMINATED && nextStatus === EmployeeStatus.TERMINATED;
    this.events.publish(tenant, {
      name: terminated ? DomainEventName.EMPLOYEE_TERMINATED : DomainEventName.EMPLOYEE_UPDATED,
      entityType: 'Employee',
      entityId: id,
      payload: { fields: Object.keys(dto), from: current.status, to: nextStatus },
    });
    return employee;
  }

  /** Soft delete: the employee is TERMINATED (history, tasks and login link are kept). */
  remove(tenant: TenantContext, id: string) {
    return this.update(tenant, id, { status: EmployeeStatus.TERMINATED });
  }

  /** 404 outside the organization, 403 when the employee works in none of the caller's branches. */
  async getAccessible(tenant: TenantContext, id: string): Promise<EmployeeRecord> {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: EMPLOYEE_SELECT,
    });
    if (!employee) throw AppException.notFound(ErrorCode.EMPLOYEE_NOT_FOUND, 'Employee not found');
    const restricted = restrictedBranchIds(tenant);
    if (restricted && !employee.branches.some((link) => restricted.includes(link.branchId))) {
      throw AppException.forbidden(
        ErrorCode.BRANCH_ACCESS_DENIED,
        'This employee does not work in any of your branches',
      );
    }
    return employee;
  }

  /**
   * For task assignment (inside the caller's transaction): the employee belongs
   * to the organization, can still be given work and works in `branchId`.
   * Locks the employee row so a concurrent termination can't slip in between.
   */
  async assertAssignable(
    tx: Prisma.TransactionClient,
    tenant: TenantContext,
    employeeId: string,
    branchId: string,
  ): Promise<{ id: string; userId: string | null }> {
    await lockRows(tx, 'employees', [employeeId], tenant.organizationId);
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, organizationId: tenant.organizationId },
      select: { id: true, userId: true, status: true, branches: { where: { branchId } } },
    });
    if (!employee) throw AppException.notFound(ErrorCode.EMPLOYEE_NOT_FOUND, 'Employee not found');
    if (!ASSIGNABLE_EMPLOYEE_STATUSES.includes(employee.status)) {
      throw AppException.conflict(
        ErrorCode.EMPLOYEE_NOT_ASSIGNABLE,
        `Employee is ${employee.status} and cannot be given tasks`,
      );
    }
    if (employee.branches.length === 0) {
      throw AppException.conflict(
        ErrorCode.TASK_ASSIGNEE_NO_BRANCH_ACCESS,
        "Employee does not work in the task's branch",
      );
    }
    return { id: employee.id, userId: employee.userId };
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private async assertReferences(
    tenant: TenantContext,
    dto: { positionId?: string; departmentId?: string; userId?: string | null },
  ): Promise<void> {
    if (dto.positionId) await this.positions.assertAssignable(tenant, dto.positionId);
    if (dto.departmentId) await this.departments.assertAssignable(tenant, dto.departmentId);
    if (dto.userId) {
      const member = await this.prisma.organizationMembership.count({
        where: {
          userId: dto.userId,
          organizationId: tenant.organizationId,
          status: MembershipStatus.ACTIVE,
        },
      });
      if (!member) {
        throw AppException.badRequest(
          ErrorCode.EMPLOYEE_USER_NOT_MEMBER,
          'userId must belong to an active member of the organization',
        );
      }
    }
  }

  /** Maps the `(organizationId, userId)` unique violation to a 409. */
  private async save<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.EMPLOYEE_USER_TAKEN,
          'This user is already linked to another employee',
        );
      }
      throw error;
    }
  }
}

const latest = (a: Date, b: Date): Date => (a > b ? a : b);

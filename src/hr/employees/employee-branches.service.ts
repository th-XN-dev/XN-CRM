import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEventName } from '../../common/events/domain-events';
import { DomainEventPublisher } from '../../common/events/domain-event.publisher';
import { isUniqueViolation } from '../../common/utils/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import { lockRows } from '../../database/row-lock';
import { BranchAccessService } from '../../tenancy/branch-access.service';
import { assertBranchAccess } from '../../tenancy/branch-scope';
import { type TenantContext } from '../../tenancy/tenant-context';
import { type AddEmployeeBranchDto } from './dto/employee.dto';
import { EMPLOYEE_BRANCH_SELECT, EmployeesService } from './employees.service';

type Tx = Prisma.TransactionClient;

/**
 * The branches an employee works in. Every change runs under the employee row
 * lock, and the primary flag moves together with `Employee.primaryBranchId`.
 */
@Injectable()
export class EmployeeBranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly events: DomainEventPublisher,
    private readonly employees: EmployeesService,
  ) {}

  async list(tenant: TenantContext, employeeId: string) {
    await this.employees.getAccessible(tenant, employeeId);
    return this.listLinks(this.prisma, employeeId);
  }

  async add(tenant: TenantContext, employeeId: string, dto: AddEmployeeBranchDto) {
    await this.employees.getAccessible(tenant, employeeId);
    await this.branches.assertWritableBranch(tenant, dto.branchId);

    try {
      const links = await this.prisma.$transaction(async (tx) => {
        await this.lockEmployee(tx, tenant, employeeId);
        const existing = await tx.employeeBranch.findUnique({
          where: { employeeId_branchId: { employeeId, branchId: dto.branchId } },
          select: { id: true },
        });
        if (existing) throw alreadyLinked();

        await tx.employeeBranch.create({
          data: {
            organizationId: tenant.organizationId,
            employeeId,
            branchId: dto.branchId,
          },
        });
        if (dto.isPrimary) await this.movePrimary(tx, employeeId, dto.branchId);
        return this.listLinks(tx, employeeId);
      });
      this.publishChanged(tenant, employeeId, { added: dto.branchId, isPrimary: !!dto.isPrimary });
      return links;
    } catch (error) {
      if (isUniqueViolation(error)) throw alreadyLinked();
      throw error;
    }
  }

  async setPrimary(tenant: TenantContext, employeeId: string, branchId: string) {
    await this.employees.getAccessible(tenant, employeeId);
    assertBranchAccess(tenant, branchId);

    const links = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenant, employeeId);
      await this.getLink(tx, employeeId, branchId);
      await this.movePrimary(tx, employeeId, branchId);
      return this.listLinks(tx, employeeId);
    });
    this.publishChanged(tenant, employeeId, { primary: branchId });
    return links;
  }

  /** The primary branch can't be removed; make another branch primary first. */
  async remove(tenant: TenantContext, employeeId: string, branchId: string) {
    await this.employees.getAccessible(tenant, employeeId);
    assertBranchAccess(tenant, branchId);

    const links = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenant, employeeId);
      const link = await this.getLink(tx, employeeId, branchId);
      if (link.isPrimary) {
        throw AppException.conflict(
          ErrorCode.EMPLOYEE_PRIMARY_BRANCH_REQUIRED,
          'Cannot remove the primary branch; make another branch primary first',
        );
      }
      await tx.employeeBranch.delete({ where: { id: link.id } });
      return this.listLinks(tx, employeeId);
    });
    this.publishChanged(tenant, employeeId, { removed: branchId });
    return links;
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private async lockEmployee(tx: Tx, tenant: TenantContext, employeeId: string): Promise<void> {
    const [locked] = await lockRows(tx, 'employees', [employeeId], tenant.organizationId);
    if (!locked) throw AppException.notFound(ErrorCode.EMPLOYEE_NOT_FOUND, 'Employee not found');
  }

  private async getLink(tx: Tx, employeeId: string, branchId: string) {
    const link = await tx.employeeBranch.findUnique({
      where: { employeeId_branchId: { employeeId, branchId } },
      select: { id: true, isPrimary: true },
    });
    if (!link) {
      throw AppException.notFound(
        ErrorCode.EMPLOYEE_BRANCH_NOT_FOUND,
        'The employee does not work in this branch',
      );
    }
    return link;
  }

  /** Clears the old primary before setting the new one (partial unique index). */
  private async movePrimary(tx: Tx, employeeId: string, branchId: string): Promise<void> {
    await tx.employeeBranch.updateMany({
      where: { employeeId, isPrimary: true, branchId: { not: branchId } },
      data: { isPrimary: false },
    });
    await tx.employeeBranch.update({
      where: { employeeId_branchId: { employeeId, branchId } },
      data: { isPrimary: true },
    });
    await tx.employee.update({ where: { id: employeeId }, data: { primaryBranchId: branchId } });
  }

  private listLinks(db: Pick<Tx, 'employeeBranch'>, employeeId: string) {
    return db.employeeBranch.findMany({
      where: { employeeId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: EMPLOYEE_BRANCH_SELECT,
    });
  }

  private publishChanged(
    tenant: TenantContext,
    employeeId: string,
    payload: Record<string, unknown>,
  ): void {
    this.events.publish(tenant, {
      name: DomainEventName.EMPLOYEE_BRANCHES_CHANGED,
      entityType: 'Employee',
      entityId: employeeId,
      payload,
    });
  }
}

const alreadyLinked = (): AppException =>
  AppException.conflict(
    ErrorCode.EMPLOYEE_BRANCH_EXISTS,
    'The employee already works in this branch',
  );

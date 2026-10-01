import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { instantInZone, isoWeekday, parseDateOnly, todayIn } from '../common/utils/dates';
import { PrismaService } from '../database/prisma.service';
import { EmployeesService } from '../hr/employees/employees.service';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { assertBranchAccess, restrictedBranchIds } from '../tenancy/branch-scope';
import { hasBranchAccess, type TenantContext } from '../tenancy/tenant-context';
import {
  type CreateChecklistDto,
  type ListChecklistDayQueryDto,
  type ListChecklistTemplatesQueryDto,
  type UpdateChecklistDto,
  type UpdateChecklistItemDto,
} from './dto/checklist.dto';

const PERSON = { select: { id: true, firstName: true, lastName: true, userId: true } } as const;

const TEMPLATE_SELECT = {
  id: true,
  branchId: true,
  title: true,
  note: true,
  dueTime: true,
  weekdays: true,
  isActive: true,
  createdAt: true,
  createdById: true,
  assignee: PERSON,
  branch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ChecklistTemplateSelect;

const ITEM_SELECT = {
  id: true,
  branchId: true,
  date: true,
  dueAt: true,
  completedAt: true,
  comment: true,
  commentAt: true,
  template: { select: { id: true, title: true, note: true, dueTime: true, createdById: true } },
  assignee: PERSON,
} satisfies Prisma.ChecklistItemSelect;

type TemplateRow = Prisma.ChecklistTemplateGetPayload<{ select: typeof TEMPLATE_SELECT }>;
type ItemRow = Prisma.ChecklistItemGetPayload<{ select: typeof ITEM_SELECT }>;

const ymd = (date: Date) => date.toISOString().slice(0, 10);
const personName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

/**
 * Daily checklists. Who sees an item: the employee it is assigned to, the
 * person who created the checklist, and members with `checklists.read` /
 * `checklists.manage` in that branch — nobody else (404).
 */
@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly employees: EmployeesService,
    private readonly events: DomainEventPublisher,
  ) {}

  // ─── Templates ─────────────────────────────────────────────────────────

  async listTemplates(tenant: TenantContext, query: ListChecklistTemplatesQueryDto) {
    const rows = await this.prisma.checklistTemplate.findMany({
      where: {
        AND: [
          this.templateVisibleWhere(tenant),
          { assigneeId: query.assigneeId, isActive: query.isActive },
        ],
      },
      orderBy: [{ isActive: 'desc' }, { dueTime: 'asc' }, { title: 'asc' }],
      select: TEMPLATE_SELECT,
    });
    return rows.map((row) => this.presentTemplate(tenant, row));
  }

  async create(tenant: TenantContext, dto: CreateChecklistDto) {
    const branchId = await this.branches.resolveWritableBranch(tenant, dto.branchId);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.employees.assertAssignable(tx, tenant, dto.assigneeId, branchId);
      return tx.checklistTemplate.create({
        data: {
          organizationId: tenant.organizationId,
          branchId,
          assigneeId: dto.assigneeId,
          title: dto.title,
          note: dto.note,
          dueTime: dto.dueTime,
          weekdays: dto.weekdays ? [...dto.weekdays].sort() : undefined,
          createdById: tenant.userId,
        },
        select: TEMPLATE_SELECT,
      });
    });
    // A checklist made today already counts for today.
    await this.ensureDay(tenant.organizationId, tenant.timezone, todayIn(tenant.timezone));
    this.events.publish(tenant, {
      name: DomainEventName.CHECKLIST_CREATED,
      entityType: 'Checklist',
      entityId: created.id,
      payload: {
        branchId,
        title: created.title,
        dueTime: created.dueTime,
        assigneeId: dto.assigneeId,
      },
    });
    return this.presentTemplate(tenant, created);
  }

  async update(tenant: TenantContext, id: string, dto: UpdateChecklistDto) {
    const current = await this.loadTemplate(tenant, id);
    const branchId = dto.branchId ?? current.branchId;
    if (dto.branchId) await this.branches.assertWritableBranch(tenant, dto.branchId);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.assigneeId || dto.branchId) {
        await this.employees.assertAssignable(
          tx,
          tenant,
          dto.assigneeId ?? current.assignee.id,
          branchId,
        );
      }
      return tx.checklistTemplate.update({
        where: { id },
        data: {
          title: dto.title,
          note: dto.note,
          dueTime: dto.dueTime,
          assigneeId: dto.assigneeId,
          branchId: dto.branchId,
          weekdays: dto.weekdays ? [...dto.weekdays].sort() : undefined,
          isActive: dto.isActive,
        },
        select: TEMPLATE_SELECT,
      });
    });
    // Today's open item follows a new time or assignee; done items stay as they were.
    if (dto.dueTime || dto.assigneeId) {
      const today = todayIn(tenant.timezone);
      await this.prisma.checklistItem.updateMany({
        where: { templateId: id, date: today, completedAt: null },
        data: {
          assigneeId: updated.assignee.id,
          dueAt: instantInZone(ymd(today), updated.dueTime, tenant.timezone),
        },
      });
    }
    this.events.publish(tenant, {
      name: DomainEventName.CHECKLIST_UPDATED,
      entityType: 'Checklist',
      entityId: id,
      payload: { branchId: updated.branchId, ...dto },
    });
    return this.presentTemplate(tenant, updated);
  }

  // ─── The day ───────────────────────────────────────────────────────────

  /** One day's items (today's are created on the spot if the scheduler hasn't yet). */
  async day(tenant: TenantContext, query: ListChecklistDayQueryDto) {
    const today = todayIn(tenant.timezone);
    const date = query.date ? parseDateOnly(query.date) : today;
    if (ymd(date) === ymd(today))
      await this.ensureDay(tenant.organizationId, tenant.timezone, date);
    if (query.branchId) assertBranchAccess(tenant, query.branchId);

    const rows = await this.prisma.checklistItem.findMany({
      where: {
        AND: [
          this.itemVisibleWhere(tenant),
          {
            date,
            assigneeId: query.assigneeId,
            branchId: query.branchId ?? tenant.branchId ?? undefined,
          },
          query.mine ? { assignee: { userId: tenant.userId } } : {},
        ],
      },
      orderBy: [{ dueAt: 'asc' }, { template: { title: 'asc' } }],
      select: ITEM_SELECT,
    });
    const branchNames = await this.branchNames(
      tenant,
      rows.map((row) => row.branchId),
    );
    const now = new Date();
    const items = rows.map((row) => this.presentItem(tenant, row, branchNames, now));
    return {
      date: ymd(date),
      stats: {
        total: items.length,
        done: items.filter((item) => item.completedAt).length,
        overdue: items.filter((item) => item.overdue).length,
      },
      items,
    };
  }

  async updateItem(tenant: TenantContext, id: string, dto: UpdateChecklistItemDto) {
    const item = await this.prisma.checklistItem.findFirst({
      where: { AND: [{ id }, this.itemVisibleWhere(tenant)] },
      select: ITEM_SELECT,
    });
    if (!item) throw notFound();
    if (!this.canEditItem(tenant, item)) {
      throw AppException.forbidden(
        ErrorCode.CHECKLIST_ACCESS_DENIED,
        'Only the assignee or a checklist manager can change this item',
      );
    }
    const now = new Date();
    const updated = await this.prisma.checklistItem.update({
      where: { id },
      data: {
        ...(dto.done !== undefined && {
          completedAt: dto.done ? (item.completedAt ?? now) : null,
          completedById: dto.done ? tenant.userId : null,
        }),
        ...(dto.comment !== undefined && {
          comment: dto.comment?.trim() || null,
          commentAt: now,
        }),
      },
      select: ITEM_SELECT,
    });
    const branchNames = await this.branchNames(tenant, [updated.branchId]);
    return this.presentItem(tenant, updated, branchNames, now);
  }

  /**
   * Creates the items of `date` for every active checklist that runs on that
   * weekday. Idempotent (unique template+date), safe from several instances.
   */
  async ensureDay(organizationId: string, timeZone: string, date: Date): Promise<number> {
    const weekday = isoWeekday(date);
    const day = ymd(date);
    const templates = await this.prisma.checklistTemplate.findMany({
      where: { organizationId, isActive: true, weekdays: { has: weekday } },
      select: { id: true, branchId: true, assigneeId: true, dueTime: true },
    });
    if (templates.length === 0) return 0;
    const { count } = await this.prisma.checklistItem.createMany({
      data: templates.map((t) => ({
        organizationId,
        branchId: t.branchId,
        templateId: t.id,
        assigneeId: t.assigneeId,
        date,
        dueAt: instantInZone(day, t.dueTime, timeZone),
      })),
      skipDuplicates: true,
    });
    return count;
  }

  // ─── Access ────────────────────────────────────────────────────────────

  private seesBranchWide(tenant: TenantContext): boolean {
    return (
      tenant.permissions.has(PERMISSIONS.CHECKLISTS_READ) ||
      tenant.permissions.has(PERMISSIONS.CHECKLISTS_MANAGE)
    );
  }

  private itemVisibleWhere(tenant: TenantContext): Prisma.ChecklistItemWhereInput {
    const own: Prisma.ChecklistItemWhereInput[] = [
      { assignee: { userId: tenant.userId } },
      { template: { createdById: tenant.userId } },
    ];
    if (!this.seesBranchWide(tenant)) return { organizationId: tenant.organizationId, OR: own };
    const restricted = restrictedBranchIds(tenant);
    return {
      organizationId: tenant.organizationId,
      OR: [...own, restricted ? { branchId: { in: restricted } } : {}],
    };
  }

  private templateVisibleWhere(tenant: TenantContext): Prisma.ChecklistTemplateWhereInput {
    const own: Prisma.ChecklistTemplateWhereInput[] = [
      { assignee: { userId: tenant.userId } },
      { createdById: tenant.userId },
    ];
    if (!this.seesBranchWide(tenant)) return { organizationId: tenant.organizationId, OR: own };
    const restricted = restrictedBranchIds(tenant);
    return {
      organizationId: tenant.organizationId,
      OR: [...own, restricted ? { branchId: { in: restricted } } : {}],
    };
  }

  private canManage(tenant: TenantContext, branchId: string, createdById: string): boolean {
    return (
      tenant.permissions.has(PERMISSIONS.CHECKLISTS_MANAGE) &&
      (hasBranchAccess(tenant, branchId) || createdById === tenant.userId)
    );
  }

  private canEditItem(tenant: TenantContext, item: ItemRow): boolean {
    return (
      item.assignee.userId === tenant.userId ||
      this.canManage(tenant, item.branchId, item.template.createdById)
    );
  }

  private async loadTemplate(tenant: TenantContext, id: string): Promise<TemplateRow> {
    const row = await this.prisma.checklistTemplate.findFirst({
      where: { AND: [{ id }, this.templateVisibleWhere(tenant)] },
      select: TEMPLATE_SELECT,
    });
    if (!row) throw notFound();
    if (!this.canManage(tenant, row.branchId, row.createdById)) {
      throw AppException.forbidden(
        ErrorCode.CHECKLIST_ACCESS_DENIED,
        'Only checklist managers can change checklists',
      );
    }
    return row;
  }

  private async branchNames(tenant: TenantContext, ids: string[]) {
    const rows = await this.prisma.branch.findMany({
      where: { organizationId: tenant.organizationId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private presentTemplate(tenant: TenantContext, row: TemplateRow) {
    const { assignee, createdById, ...rest } = row;
    return {
      ...rest,
      assignee: { id: assignee.id, name: personName(assignee), userId: assignee.userId },
      canManage: this.canManage(tenant, row.branchId, createdById),
    };
  }

  private presentItem(
    tenant: TenantContext,
    row: ItemRow,
    branches: Map<string, string>,
    now: Date,
  ) {
    const { template, assignee, branchId, ...rest } = row;
    return {
      ...rest,
      overdue: !row.completedAt && row.dueAt < now,
      template: {
        id: template.id,
        title: template.title,
        note: template.note,
        dueTime: template.dueTime,
      },
      assignee: { id: assignee.id, name: personName(assignee), userId: assignee.userId },
      branch: { id: branchId, name: branches.get(branchId) ?? '' },
      canEdit: this.canEditItem(tenant, row),
    };
  }
}

const notFound = (): AppException =>
  AppException.notFound(ErrorCode.CHECKLIST_NOT_FOUND, 'Checklist not found');

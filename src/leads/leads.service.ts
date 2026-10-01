import { HttpStatus, Injectable } from '@nestjs/common';
import { LeadActivityType, LeadStatus, Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DomainEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { Paginated } from '../common/pagination/paginated';
import { pageArgs } from '../common/pagination/pagination-query.dto';
import { icontains, phoneContains, searchWhere } from '../common/pagination/search';
import { localDayBounds, parseDateOnly, todayIn } from '../common/utils/dates';
import { normalizeLeadPhone } from '../common/utils/normalize';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { lockRows } from '../database/row-lock';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { FamiliesService } from '../families/families.service';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { assertBranchAccess, branchListFilter } from '../tenancy/branch-scope';
import { hasBranchAccess, type TenantContext } from '../tenancy/tenant-context';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { type AssignLeadDto } from './dto/assign-lead.dto';
import { type ChangeLeadStatusDto } from './dto/change-lead-status.dto';
import { type ConvertLeadDto } from './dto/convert-lead.dto';
import {
  type CreateLeadActivityDto,
  type ListActivitiesQueryDto,
} from './dto/create-lead-activity.dto';
import { type CreateLeadDto } from './dto/create-lead.dto';
import { type ListFollowUpsQueryDto } from './dto/list-follow-ups-query.dto';
import { type ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { type SetFollowUpDto } from './dto/set-follow-up.dto';
import { type UpdateLeadDto } from './dto/update-lead.dto';
import { LeadPipelinesService } from './lead-pipelines.service';
import { LeadSourcesService } from './lead-sources.service';
import { leadAccessWhere } from './lead.access';
import { canChangeStatus, isTerminal, TERMINAL_LEAD_STATUSES } from './lead-status';

const LEAD_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  name: true,
  phone: true,
  secondaryPhone: true,
  sourceId: true,
  stageId: true,
  assignedToId: true,
  status: true,
  priority: true,
  notes: true,
  nextFollowUpAt: true,
  convertedAt: true,
  convertedFamilyId: true,
  convertedStudentId: true,
  lostReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadSelect;

const LEAD_LIST_SELECT = {
  ...LEAD_SELECT,
  source: { select: { id: true, name: true, code: true } },
  stage: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

const ACTIVITY_SELECT = {
  id: true,
  leadId: true,
  userId: true,
  type: true,
  note: true,
  metadata: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} satisfies Prisma.LeadActivitySelect;

type LeadRecord = Prisma.LeadGetPayload<{ select: typeof LEAD_SELECT }>;
type Tx = Prisma.TransactionClient;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly tenantContext: TenantContextService,
    private readonly events: DomainEventPublisher,
    private readonly families: FamiliesService,
    private readonly enrollments: EnrollmentsService,
    private readonly sources: LeadSourcesService,
    private readonly pipelines: LeadPipelinesService,
  ) {}

  async create(tenant: TenantContext, dto: CreateLeadDto) {
    const branchId = await this.branches.resolveWritableBranch(tenant, dto.branchId);
    const phoneNormalized = normalizeLeadPhone(dto.phone);

    const duplicate = await this.findLiveByPhone(tenant, phoneNormalized);
    if (duplicate) throw duplicateLead(duplicate);

    if (dto.sourceId) await this.sources.assertUsable(tenant, dto.sourceId);
    if (dto.stageId) await this.pipelines.getStage(tenant, dto.stageId);
    if (dto.assignedToId) await this.assertAssignee(tenant, dto.assignedToId, branchId);

    let lead: LeadRecord;
    try {
      lead = await this.prisma.lead.create({
        data: {
          organizationId: tenant.organizationId,
          branchId,
          name: dto.name,
          phone: dto.phone,
          phoneNormalized,
          secondaryPhone: dto.secondaryPhone,
          sourceId: dto.sourceId,
          stageId: dto.stageId,
          assignedToId: dto.assignedToId,
          priority: dto.priority,
          notes: dto.notes,
          nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
        },
        select: LEAD_SELECT,
      });
    } catch (error) {
      // Backstop for the partial unique index under concurrent creates.
      if (isUniqueViolation(error)) {
        const existing = await this.findLiveByPhone(tenant, phoneNormalized);
        throw duplicateLead(existing);
      }
      throw error;
    }

    if (dto.assignedToId) {
      await this.recordActivity(this.prisma, tenant, lead, LeadActivityType.ASSIGNED, null, {
        assignedToId: dto.assignedToId,
      });
    }
    this.events.publish(tenant, {
      name: DomainEventName.LEAD_CREATED,
      entityType: 'Lead',
      entityId: lead.id,
      payload: { branchId: lead.branchId, sourceId: lead.sourceId },
    });
    return lead;
  }

  async list(tenant: TenantContext, query: ListLeadsQueryDto) {
    const where: Prisma.LeadWhereInput = {
      AND: [
        leadAccessWhere(tenant),
        {
          branchId: branchListFilter(tenant, query.branchId),
          status: query.status,
          priority: query.priority,
          sourceId: query.sourceId,
          stageId: query.stageId,
          assignedToId: query.assignedToId,
          ...(query.phone && { phoneNormalized: normalizeLeadPhone(query.phone) }),
          ...((query.from || query.to) && {
            createdAt: {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            },
          }),
        },
        searchWhere<Prisma.LeadWhereInput>(query.search, (term) => [
          { name: icontains(term) },
          { phone: phoneContains(term) },
          { secondaryPhone: phoneContains(term) },
        ]) ?? {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...pageArgs(query),
        select: LEAD_LIST_SELECT,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  async findOne(tenant: TenantContext, id: string) {
    await this.getAccessible(tenant, id);
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id },
      select: {
        ...LEAD_LIST_SELECT,
        activities: { orderBy: { createdAt: 'desc' }, take: 10, select: ACTIVITY_SELECT },
      },
    });
    const { activities, ...rest } = lead;
    return { ...rest, recentActivities: activities };
  }

  async update(tenant: TenantContext, id: string, dto: UpdateLeadDto) {
    const current = await this.getAccessible(tenant, id);
    const { phone, sourceId, stageId, nextFollowUpAt, ...rest } = dto;

    if (sourceId) await this.sources.assertUsable(tenant, sourceId);
    if (stageId) await this.pipelines.getStage(tenant, stageId);

    let phoneNormalized: string | undefined;
    if (phone && phone !== current.phone) {
      phoneNormalized = normalizeLeadPhone(phone);
      const duplicate = await this.findLiveByPhone(tenant, phoneNormalized, id);
      if (duplicate) throw duplicateLead(duplicate);
    }

    const lead = await this.prisma.lead.update({
      where: { id, organizationId: tenant.organizationId },
      data: {
        ...rest,
        phone,
        phoneNormalized,
        sourceId,
        stageId,
        nextFollowUpAt:
          nextFollowUpAt === undefined
            ? undefined
            : nextFollowUpAt
              ? new Date(nextFollowUpAt)
              : null,
      },
      select: LEAD_SELECT,
    });
    this.events.publish(tenant, {
      name: DomainEventName.LEAD_UPDATED,
      entityType: 'Lead',
      entityId: id,
      payload: { fields: Object.keys(dto) },
    });
    return lead;
  }

  /** Soft delete: the lead is hidden but its history (activities) is preserved. */
  async remove(tenant: TenantContext, id: string) {
    await this.getAccessible(tenant, id);
    const lead = await this.prisma.lead.update({
      where: { id, organizationId: tenant.organizationId },
      data: { deletedAt: new Date() },
      select: LEAD_SELECT,
    });
    this.events.publish(tenant, {
      name: DomainEventName.LEAD_DELETED,
      entityType: 'Lead',
      entityId: id,
      payload: {},
    });
    return lead;
  }

  async changeStatus(tenant: TenantContext, id: string, dto: ChangeLeadStatusDto) {
    const current = await this.getAccessible(tenant, id);
    if (dto.status === LeadStatus.CONVERTED) {
      throw AppException.badRequest(
        ErrorCode.LEAD_NOT_CONVERTIBLE,
        'Use POST /leads/:id/convert to convert a lead',
      );
    }
    if (isTerminal(current.status)) {
      throw current.status === LeadStatus.CONVERTED
        ? alreadyConverted()
        : AppException.conflict(ErrorCode.LEAD_NOT_CONVERTIBLE, 'Lead is lost; create a new lead');
    }
    if (!canChangeStatus(current.status, dto.status)) {
      throw AppException.badRequest(
        ErrorCode.LEAD_NOT_CONVERTIBLE,
        `Cannot change lead status from ${current.status} to ${dto.status}`,
      );
    }
    if (dto.stageId) await this.pipelines.getStage(tenant, dto.stageId);

    const isLost = dto.status === LeadStatus.LOST;
    const lead = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id, organizationId: tenant.organizationId },
        data: {
          status: dto.status,
          stageId: dto.stageId,
          lostReason: isLost ? (dto.reason ?? null) : null,
        },
        select: LEAD_SELECT,
      });
      await this.recordActivity(
        tx,
        tenant,
        updated,
        LeadActivityType.STATUS_CHANGED,
        dto.reason ?? null,
        {
          from: current.status,
          to: dto.status,
        },
      );
      return updated;
    });

    this.events.publish(tenant, {
      name: isLost ? DomainEventName.LEAD_LOST : DomainEventName.LEAD_STATUS_CHANGED,
      entityType: 'Lead',
      entityId: id,
      payload: { from: current.status, to: dto.status },
    });
    return lead;
  }

  async assign(tenant: TenantContext, id: string, dto: AssignLeadDto) {
    const current = await this.getAccessible(tenant, id);
    if (dto.assignedToId) await this.assertAssignee(tenant, dto.assignedToId, current.branchId);

    const lead = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id, organizationId: tenant.organizationId },
        data: { assignedToId: dto.assignedToId },
        select: LEAD_SELECT,
      });
      await this.recordActivity(tx, tenant, updated, LeadActivityType.ASSIGNED, null, {
        assignedToId: dto.assignedToId,
      });
      return updated;
    });

    this.events.publish(tenant, {
      name: DomainEventName.LEAD_ASSIGNED,
      entityType: 'Lead',
      entityId: id,
      payload: { assignedToId: dto.assignedToId },
    });
    return lead;
  }

  async setFollowUp(tenant: TenantContext, id: string, dto: SetFollowUpDto) {
    await this.getAccessible(tenant, id);
    const nextFollowUpAt = dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null;

    const lead = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id, organizationId: tenant.organizationId },
        data: { nextFollowUpAt },
        select: LEAD_SELECT,
      });
      await this.recordActivity(tx, tenant, updated, LeadActivityType.FOLLOW_UP, null, {
        nextFollowUpAt: nextFollowUpAt?.toISOString() ?? null,
      });
      return updated;
    });

    this.events.publish(tenant, {
      name: DomainEventName.LEAD_FOLLOW_UP_SET,
      entityType: 'Lead',
      entityId: id,
      payload: { nextFollowUpAt: nextFollowUpAt?.toISOString() ?? null },
    });
    return lead;
  }

  async listFollowUps(tenant: TenantContext, query: ListFollowUpsQueryDto) {
    // nextFollowUpAt is an instant: "today" is the organization's local calendar day.
    const { start: todayStart, end: tomorrowStart } = localDayBounds(tenant.timezone);

    let window: Prisma.DateTimeFilter | undefined;
    if (query.filter === 'today') window = { gte: todayStart, lt: tomorrowStart };
    else if (query.filter === 'overdue') window = { lt: todayStart };
    else if (query.filter === 'upcoming') window = { gte: tomorrowStart };

    const where: Prisma.LeadWhereInput = {
      AND: [
        leadAccessWhere(tenant),
        {
          branchId: branchListFilter(tenant, query.branchId),
          assignedToId: query.assignedToId,
          status: { notIn: TERMINAL_LEAD_STATUSES },
          nextFollowUpAt: window ?? { not: null },
        },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy: [{ nextFollowUpAt: 'asc' }, { id: 'asc' }],
        ...pageArgs(query),
        select: LEAD_LIST_SELECT,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  async addActivity(tenant: TenantContext, id: string, dto: CreateLeadActivityDto) {
    const lead = await this.getAccessible(tenant, id);
    const activity = await this.recordActivity(
      this.prisma,
      tenant,
      lead,
      dto.type,
      dto.note ?? null,
    );
    this.events.publish(tenant, {
      name: DomainEventName.LEAD_ACTIVITY_CREATED,
      entityType: 'LeadActivity',
      entityId: activity.id,
      payload: { leadId: id, type: dto.type },
    });
    return activity;
  }

  async listActivities(tenant: TenantContext, id: string, query: ListActivitiesQueryDto) {
    await this.getAccessible(tenant, id);
    const where: Prisma.LeadActivityWhereInput = {
      leadId: id,
      organizationId: tenant.organizationId,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.leadActivity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        select: ACTIVITY_SELECT,
      }),
      this.prisma.leadActivity.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  /**
   * Converts a lead into a Family + Student (+ optional Enrollment) atomically,
   * then stamps the lead CONVERTED. Every write is in one transaction; a
   * concurrent conversion of the same lead is rejected under the lead lock.
   */
  async convert(tenant: TenantContext, id: string, dto: ConvertLeadDto) {
    const lead = await this.getAccessible(tenant, id);
    this.assertConvertible(lead);

    // Validate/prepare the family outside the transaction where possible.
    let existingFamily: Awaited<ReturnType<FamiliesService['getAccessible']>> | null = null;
    if (dto.familyId) {
      existingFamily = await this.families.getAccessible(tenant, dto.familyId);
      if (!existingFamily.isActive) {
        throw AppException.conflict(ErrorCode.FAMILY_INACTIVE, 'Family is inactive');
      }
    }
    const familyData = dto.familyId
      ? null
      : await this.families.prepareCreate(
          tenant,
          dto.family ?? {
            name: lead.name,
            phone: lead.phone,
            secondaryPhone: lead.secondaryPhone ?? undefined,
          },
          lead.branchId,
        );

    const today = todayIn(tenant.timezone);
    const startedAt = dto.startedAt ? parseDateOnly(dto.startedAt) : today;
    const { firstName, lastName, middleName, birthDate, gender, phone, notes } = dto.student;

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockLead(tx, tenant, id);

      const createdFamily = familyData
        ? await tx.family.create({ data: familyData, select: { id: true, name: true } })
        : null;
      const familyId = createdFamily?.id ?? dto.familyId!;

      const student = await tx.student.create({
        data: {
          organizationId: tenant.organizationId,
          familyId,
          branchId: lead.branchId,
          firstName,
          lastName,
          middleName,
          gender,
          phone,
          notes,
          birthDate: birthDate ? parseDateOnly(birthDate) : undefined,
          joinedAt: today,
        },
        select: { id: true, firstName: true, lastName: true },
      });

      const enrollment = dto.groupId
        ? await this.enrollments.enrollWithinTx(tx, tenant, {
            studentId: student.id,
            groupId: dto.groupId,
            startedAt,
          })
        : null;

      const updatedLead = await tx.lead.update({
        where: { id, organizationId: tenant.organizationId },
        data: {
          status: LeadStatus.CONVERTED,
          convertedAt: new Date(),
          convertedFamilyId: familyId,
          convertedStudentId: student.id,
        },
        select: LEAD_SELECT,
      });
      await this.recordActivity(tx, tenant, updatedLead, LeadActivityType.STATUS_CHANGED, null, {
        from: lead.status,
        to: LeadStatus.CONVERTED,
        familyId,
        studentId: student.id,
        enrollmentId: enrollment?.id ?? null,
      });

      const family = createdFamily ?? { id: dto.familyId!, name: existingFamily!.name };
      return { lead: updatedLead, family, student, enrollmentId: enrollment?.id ?? null };
    });

    // Post-commit events, matching the normal create flows.
    if (familyData) this.families.publishCreated(tenant, result.family);
    this.events.publish(tenant, {
      name: DomainEventName.STUDENT_CREATED,
      entityType: 'Student',
      entityId: result.student.id,
      payload: { familyId: result.family.id, branchId: lead.branchId, fromLeadId: id },
    });
    if (result.enrollmentId) {
      this.events.publish(tenant, {
        name: DomainEventName.ENROLLMENT_CREATED,
        entityType: 'Enrollment',
        entityId: result.enrollmentId,
        payload: { studentId: result.student.id, groupId: dto.groupId },
      });
    }
    this.events.publish(tenant, {
      name: DomainEventName.LEAD_CONVERTED,
      entityType: 'Lead',
      entityId: id,
      payload: {
        familyId: result.family.id,
        studentId: result.student.id,
        enrollmentId: result.enrollmentId,
      },
    });
    return result;
  }

  /** 404 outside the organization, 403 outside the caller's branches. */
  async getAccessible(tenant: TenantContext, id: string): Promise<LeadRecord> {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId: tenant.organizationId, deletedAt: null },
      select: LEAD_SELECT,
    });
    if (!lead) throw AppException.notFound(ErrorCode.LEAD_NOT_FOUND, 'Lead not found');
    assertBranchAccess(tenant, lead.branchId);
    return lead;
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private assertConvertible(lead: LeadRecord): void {
    if (lead.status === LeadStatus.CONVERTED || lead.convertedAt) throw alreadyConverted();
    if (lead.status === LeadStatus.LOST) {
      throw AppException.conflict(
        ErrorCode.LEAD_NOT_CONVERTIBLE,
        'Lead is lost and cannot be converted',
      );
    }
  }

  private async lockLead(tx: Tx, tenant: TenantContext, id: string): Promise<void> {
    const [locked] = await lockRows(tx, 'leads', [id], tenant.organizationId);
    if (!locked) throw AppException.notFound(ErrorCode.LEAD_NOT_FOUND, 'Lead not found');
    const fresh = await tx.lead.findUniqueOrThrow({
      where: { id },
      select: { status: true, convertedAt: true, deletedAt: true },
    });
    if (fresh.deletedAt) throw AppException.notFound(ErrorCode.LEAD_NOT_FOUND, 'Lead not found');
    if (fresh.status === LeadStatus.CONVERTED || fresh.convertedAt) throw alreadyConverted();
    if (fresh.status === LeadStatus.LOST) {
      throw AppException.conflict(
        ErrorCode.LEAD_NOT_CONVERTIBLE,
        'Lead is lost and cannot be converted',
      );
    }
  }

  private findLiveByPhone(tenant: TenantContext, phoneNormalized: string, excludeId?: string) {
    return this.prisma.lead.findFirst({
      where: {
        organizationId: tenant.organizationId,
        phoneNormalized,
        deletedAt: null,
        status: { notIn: TERMINAL_LEAD_STATUSES },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: LEAD_LIST_SELECT,
    });
  }

  private async assertAssignee(
    tenant: TenantContext,
    userId: string,
    branchId: string,
  ): Promise<void> {
    const resolved = (await this.tenantContext.resolve(userId, tenant.organizationId))?.tenant;
    if (!resolved || !resolved.permissions.has(PERMISSIONS.LEADS_READ)) {
      throw AppException.conflict(
        ErrorCode.LEAD_ASSIGNEE_NOT_MEMBER,
        'Assignee is not a member of this organization with lead access',
      );
    }
    if (!hasBranchAccess(resolved, branchId)) {
      throw AppException.conflict(
        ErrorCode.LEAD_ASSIGNEE_NO_BRANCH_ACCESS,
        "Assignee does not have access to the lead's branch",
      );
    }
  }

  private recordActivity(
    client: PrismaService | Tx,
    tenant: TenantContext,
    lead: { id: string; branchId: string },
    type: LeadActivityType,
    note: string | null,
    metadata?: Record<string, unknown>,
  ) {
    return client.leadActivity.create({
      data: {
        organizationId: tenant.organizationId,
        branchId: lead.branchId,
        leadId: lead.id,
        userId: tenant.userId,
        type,
        note,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      },
      select: ACTIVITY_SELECT,
    });
  }
}

function duplicateLead(existing: unknown): AppException {
  return new AppException(
    ErrorCode.DUPLICATE_LEAD,
    'An active lead with this phone already exists',
    HttpStatus.CONFLICT,
    existing ?? undefined,
  );
}

const alreadyConverted = (): AppException =>
  AppException.conflict(ErrorCode.LEAD_ALREADY_CONVERTED, 'Lead is already converted');

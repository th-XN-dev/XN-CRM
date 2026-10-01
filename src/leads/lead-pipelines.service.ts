import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  type CreateLeadPipelineDto,
  type CreateLeadStageDto,
  type UpdateLeadPipelineDto,
  type UpdateLeadStageDto,
} from './dto/lead-pipeline.dto';

const STAGE_SELECT = {
  id: true,
  organizationId: true,
  pipelineId: true,
  name: true,
  code: true,
  order: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadStageSelect;

const PIPELINE_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  isActive: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
  stages: { orderBy: { order: 'asc' }, select: STAGE_SELECT },
} satisfies Prisma.LeadPipelineSelect;

@Injectable()
export class LeadPipelinesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenant: TenantContext, dto: CreateLeadPipelineDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefault(tx, tenant.organizationId);
      return tx.leadPipeline.create({
        data: {
          name: dto.name,
          isDefault: dto.isDefault ?? false,
          organizationId: tenant.organizationId,
        },
        select: PIPELINE_SELECT,
      });
    });
  }

  list(tenant: TenantContext) {
    return this.prisma.leadPipeline.findMany({
      where: { organizationId: tenant.organizationId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: PIPELINE_SELECT,
    });
  }

  findOne(tenant: TenantContext, id: string) {
    return this.getPipeline(tenant, id);
  }

  async update(tenant: TenantContext, id: string, dto: UpdateLeadPipelineDto) {
    await this.getPipeline(tenant, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefault(tx, tenant.organizationId);
      return tx.leadPipeline.update({
        where: { id, organizationId: tenant.organizationId },
        data: { name: dto.name, isActive: dto.isActive, isDefault: dto.isDefault },
        select: PIPELINE_SELECT,
      });
    });
  }

  async remove(tenant: TenantContext, id: string) {
    await this.getPipeline(tenant, id);
    const referenced = await this.prisma.lead.count({
      where: { organizationId: tenant.organizationId, stage: { pipelineId: id }, deletedAt: null },
    });
    if (referenced > 0) {
      throw AppException.conflict(
        ErrorCode.LEAD_PIPELINE_HAS_LEADS,
        'Pipeline has leads in its stages; reassign them first',
      );
    }
    // Stages cascade with the pipeline.
    await this.prisma.leadPipeline.delete({ where: { id, organizationId: tenant.organizationId } });
    return { id };
  }

  // ─── stages ───────────────────────────────────────────────────────────────

  async listStages(tenant: TenantContext, pipelineId: string) {
    await this.getPipeline(tenant, pipelineId);
    return this.prisma.leadStage.findMany({
      where: { pipelineId, organizationId: tenant.organizationId },
      orderBy: { order: 'asc' },
      select: STAGE_SELECT,
    });
  }

  async addStage(tenant: TenantContext, pipelineId: string, dto: CreateLeadStageDto) {
    await this.getPipeline(tenant, pipelineId);
    try {
      return await this.prisma.leadStage.create({
        data: {
          organizationId: tenant.organizationId,
          pipelineId,
          name: dto.name,
          code: dto.code,
          order: dto.order ?? 0,
        },
        select: STAGE_SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw stageCodeTaken();
      throw error;
    }
  }

  async updateStage(tenant: TenantContext, stageId: string, dto: UpdateLeadStageDto) {
    await this.getStage(tenant, stageId);
    try {
      return await this.prisma.leadStage.update({
        where: { id: stageId, organizationId: tenant.organizationId },
        data: dto,
        select: STAGE_SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw stageCodeTaken();
      throw error;
    }
  }

  async removeStage(tenant: TenantContext, stageId: string) {
    await this.getStage(tenant, stageId);
    const referenced = await this.prisma.lead.count({
      where: { organizationId: tenant.organizationId, stageId, deletedAt: null },
    });
    if (referenced > 0) {
      throw AppException.conflict(
        ErrorCode.LEAD_STAGE_HAS_LEADS,
        'Stage has leads; reassign them first',
      );
    }
    await this.prisma.leadStage.delete({
      where: { id: stageId, organizationId: tenant.organizationId },
    });
    return { id: stageId };
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  async getPipeline(tenant: TenantContext, id: string) {
    const pipeline = await this.prisma.leadPipeline.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: PIPELINE_SELECT,
    });
    if (!pipeline) {
      throw AppException.notFound(ErrorCode.LEAD_PIPELINE_NOT_FOUND, 'Pipeline not found');
    }
    return pipeline;
  }

  async getStage(tenant: TenantContext, stageId: string) {
    const stage = await this.prisma.leadStage.findFirst({
      where: { id: stageId, organizationId: tenant.organizationId },
      select: STAGE_SELECT,
    });
    if (!stage) {
      throw AppException.notFound(ErrorCode.LEAD_STAGE_NOT_FOUND, 'Stage not found');
    }
    return stage;
  }

  private clearDefault(tx: Prisma.TransactionClient, organizationId: string) {
    return tx.leadPipeline.updateMany({
      where: { organizationId, isDefault: true },
      data: { isDefault: false },
    });
  }
}

const stageCodeTaken = (): AppException =>
  AppException.conflict(
    ErrorCode.LEAD_STAGE_CODE_TAKEN,
    'A stage with this code already exists in the pipeline',
  );

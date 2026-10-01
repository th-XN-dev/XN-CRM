import { Injectable } from '@nestjs/common';
import { NotificationChannel, type NotificationType, type Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { Paginated } from '../../common/pagination/paginated';
import { pageArgs } from '../../common/pagination/pagination-query.dto';
import { isUniqueViolation } from '../../common/utils/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import { type TenantContext } from '../../tenancy/tenant-context';
import { NOTIFICATION_TYPE_KEYS, NOTIFICATION_TYPES } from '../core/notification-types.catalog';
import { renderTemplate, type TemplateValues, unknownVariables } from '../core/template-renderer';
import {
  type CreateNotificationTemplateDto,
  type ListNotificationTemplatesDto,
  type UpdateNotificationTemplateDto,
} from '../dto/template.dto';

export interface RenderedText {
  title: string;
  message: string;
}

/** Organization-editable texts over the code defaults, rendered with allow-listed variables only. */
@Injectable()
export class NotificationTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  catalog() {
    return NOTIFICATION_TYPE_KEYS.map((type) => {
      const definition = NOTIFICATION_TYPES[type];
      return {
        type,
        priority: definition.priority,
        critical: definition.critical,
        variables: [...definition.variables],
        defaultTemplate: definition.template,
      };
    });
  }

  async list(tenant: TenantContext, query: ListNotificationTemplatesDto) {
    const where: Prisma.NotificationTemplateWhereInput = {
      organizationId: tenant.organizationId,
      type: query.type,
      channel: query.channel,
      isActive: query.isActive,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationTemplate.findMany({
        where,
        orderBy: [{ type: 'asc' }, { channel: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.notificationTemplate.count({ where }),
    ]);
    return new Paginated(items, total, query);
  }

  async create(tenant: TenantContext, dto: CreateNotificationTemplateDto) {
    assertVariables(dto.type, [dto.titleTemplate, dto.messageTemplate]);
    try {
      return await this.prisma.notificationTemplate.create({
        data: { ...dto, organizationId: tenant.organizationId },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.NOTIFICATION_TEMPLATE_EXISTS,
          `A ${dto.channel} template for ${dto.type} already exists; edit it instead`,
        );
      }
      throw error;
    }
  }

  async update(tenant: TenantContext, id: string, dto: UpdateNotificationTemplateDto) {
    const current = await this.getOwned(tenant, id);
    assertVariables(current.type, [
      dto.titleTemplate ?? current.titleTemplate,
      dto.messageTemplate ?? current.messageTemplate,
    ]);
    return this.prisma.notificationTemplate.update({ where: { id }, data: dto });
  }

  /** Deleting reverts the (type, channel) to the default text. */
  async remove(tenant: TenantContext, id: string) {
    const template = await this.getOwned(tenant, id);
    await this.prisma.notificationTemplate.delete({ where: { id } });
    return template;
  }

  /**
   * Text for a channel: the organization's template for that channel, else its
   * IN_APP template, else the code default.
   */
  async render(
    organizationId: string,
    type: NotificationType,
    channel: NotificationChannel,
    values: TemplateValues,
  ): Promise<RenderedText> {
    const candidates = await this.prisma.notificationTemplate.findMany({
      where: {
        organizationId,
        type,
        isActive: true,
        channel: { in: [channel, NotificationChannel.IN_APP] },
      },
    });
    const definition = NOTIFICATION_TYPES[type];
    const chosen =
      candidates.find((t) => t.channel === channel) ??
      candidates.find((t) => t.channel === NotificationChannel.IN_APP);
    const title = chosen?.titleTemplate ?? definition.template.title;
    const message = chosen?.messageTemplate ?? definition.template.message;
    return {
      title: renderTemplate(title, values, definition.variables).slice(0, 200),
      message: renderTemplate(message, values, definition.variables).slice(0, 2000),
    };
  }

  private async getOwned(tenant: TenantContext, id: string) {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!template) {
      throw AppException.notFound(
        ErrorCode.NOTIFICATION_TEMPLATE_NOT_FOUND,
        'Notification template not found',
      );
    }
    return template;
  }
}

function assertVariables(type: NotificationType, templates: string[]): void {
  const allowed = NOTIFICATION_TYPES[type].variables;
  const unknown = unknownVariables(templates, allowed);
  if (unknown.length > 0) {
    throw AppException.badRequest(
      ErrorCode.NOTIFICATION_TEMPLATE_INVALID_VARIABLE,
      `Unknown variable(s) for ${type}: ${unknown.join(', ')}. Allowed: ${allowed.join(', ')}`,
    );
  }
}

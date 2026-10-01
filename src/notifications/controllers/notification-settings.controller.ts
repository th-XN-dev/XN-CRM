import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';
import {
  ApiEnvelopeArrayResponse,
  ApiEnvelopeResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import { PERMISSIONS } from '../../permissions/permissions.catalog';
import { CurrentTenant } from '../../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../../tenancy/tenant-context';
import {
  ListDeliveriesQueryDto,
  NotificationDeliveryResponseDto,
  ProviderStatusDto,
} from '../dto/notification.dto';
import { NotificationPolicyResponseDto, UpdateNotificationPolicyDto } from '../dto/policy.dto';
import {
  NotificationPreferenceResponseDto,
  UpdateNotificationPreferencesDto,
} from '../dto/preference.dto';
import {
  CreateNotificationTemplateDto,
  ListNotificationTemplatesDto,
  NotificationTemplateResponseDto,
  NotificationTypeCatalogDto,
  UpdateNotificationTemplateDto,
} from '../dto/template.dto';
import { SkipAudit } from '../../audit/audit.interceptor';
import { NotificationAdminService } from '../notification-admin.service';
import { NotificationPoliciesService } from '../policies/notification-policies.service';
import { NotificationPreferencesService } from '../preferences/notification-preferences.service';
import { NotificationTemplatesService } from '../templates/notification-templates.service';

@ApiTags('Notifications · Preferences')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.NOTIFICATION_PREFERENCES_READ)
  @ApiOperation({ summary: 'My channels per notification type (with locked channels)' })
  @ApiEnvelopeArrayResponse(NotificationPreferenceResponseDto)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.preferences.list(tenant);
  }

  @Patch()
  @SkipAudit()
  @RequirePermissions(PERMISSIONS.NOTIFICATION_PREFERENCES_UPDATE)
  @ApiOperation({ summary: 'Change my channels for one or more types' })
  @ApiEnvelopeResponse(NotificationPreferenceResponseDto)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'NOTIFICATION_CHANNEL_LOCKED')
  update(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.preferences.update(tenant, dto);
  }
}

@ApiTags('Notifications · Templates')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('notification-templates')
export class NotificationTemplatesController {
  constructor(private readonly templates: NotificationTemplatesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.NOTIFICATION_TEMPLATES_READ)
  @ApiOperation({ summary: "The organization's custom templates" })
  @ApiPaginatedResponse(NotificationTemplateResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListNotificationTemplatesDto) {
    return this.templates.list(tenant, query);
  }

  @Get('catalog')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_TEMPLATES_READ)
  @ApiOperation({ summary: 'Types with their allowed variables and default texts' })
  @ApiEnvelopeArrayResponse(NotificationTypeCatalogDto)
  catalog() {
    return this.templates.catalog();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Override the text of a (type, channel)' })
  @ApiEnvelopeResponse(NotificationTemplateResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'NOTIFICATION_TEMPLATE_INVALID_VARIABLE')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'NOTIFICATION_TEMPLATE_EXISTS')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateNotificationTemplateDto) {
    return this.templates.create(tenant, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Edit or (de)activate a template' })
  @ApiEnvelopeResponse(NotificationTemplateResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'NOTIFICATION_TEMPLATE_NOT_FOUND')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotificationTemplateDto,
  ) {
    return this.templates.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Delete a template (the default text applies again)' })
  @ApiEnvelopeResponse(NotificationTemplateResponseDto)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.remove(tenant, id);
  }
}

/** Organization-level configuration and delivery monitoring. */
@ApiTags('Notifications · Administration')
@ApiBearerAuth()
@OrganizationScoped()
@Controller()
export class NotificationAdminController {
  constructor(
    private readonly policies: NotificationPoliciesService,
    private readonly admin: NotificationAdminService,
  ) {}

  @Get('notification-policies')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_MANAGE)
  @ApiOperation({ summary: 'Type policies: on/off, audience, default and locked channels' })
  @ApiEnvelopeArrayResponse(NotificationPolicyResponseDto)
  listPolicies(@CurrentTenant() tenant: TenantContext) {
    return this.policies.list(tenant);
  }

  @Patch('notification-policies/:type')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_MANAGE)
  @ApiOperation({ summary: 'Change the policy of a notification type' })
  @ApiEnvelopeResponse(NotificationPolicyResponseDto)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'NOTIFICATION_TYPE_CRITICAL / INVALID_PERMISSION_KEY')
  updatePolicy(
    @CurrentTenant() tenant: TenantContext,
    @Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Body() dto: UpdateNotificationPolicyDto,
  ) {
    return this.policies.update(tenant, type, dto);
  }

  @Get('notification-deliveries')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_DELIVERY_READ)
  @ApiOperation({ summary: 'Delivery history of the organization (filter by channel/status)' })
  @ApiPaginatedResponse(NotificationDeliveryResponseDto)
  listDeliveries(@CurrentTenant() tenant: TenantContext, @Query() query: ListDeliveriesQueryDto) {
    return this.admin.listDeliveries(tenant, query);
  }

  @Post('notification-deliveries/:id/retry')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_MANAGE)
  @ApiOperation({ summary: 'Retry a FAILED delivery (fresh round of attempts)' })
  @ApiEnvelopeResponse(NotificationDeliveryResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'NOTIFICATION_DELIVERY_NOT_RETRYABLE')
  retry(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.retry(tenant, id);
  }

  @Get('notification-providers')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_PROVIDERS_MANAGE)
  @ApiOperation({ summary: 'Which provider serves each channel (no secrets)' })
  @ApiEnvelopeArrayResponse(ProviderStatusDto)
  providers() {
    return this.admin.providers();
  }
}

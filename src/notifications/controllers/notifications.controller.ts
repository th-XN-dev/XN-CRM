import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  ListNotificationsQueryDto,
  MarkAllReadResultDto,
  NotificationDeliveryResponseDto,
  NotificationResponseDto,
  SendResultDto,
  SendSystemNotificationDto,
  UnreadCountDto,
} from '../dto/notification.dto';
import { SkipAudit } from '../../audit/audit.interceptor';
import { NotificationAdminService } from '../notification-admin.service';
import { NotificationInboxService } from '../notification-inbox.service';

/** The caller's own inbox in the current organization. */
@ApiTags('Notifications')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly inbox: NotificationInboxService,
    private readonly admin: NotificationAdminService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  @ApiOperation({ summary: 'My notifications (filter by type, priority, isRead, from/to)' })
  @ApiPaginatedResponse(NotificationResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListNotificationsQueryDto) {
    return this.inbox.list(tenant, query);
  }

  @Get('unread')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  @ApiOperation({ summary: 'My unread notifications' })
  @ApiPaginatedResponse(NotificationResponseDto)
  unread(@CurrentTenant() tenant: TenantContext, @Query() query: ListNotificationsQueryDto) {
    return this.inbox.list(tenant, query, true);
  }

  @Get('unread-count')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  @ApiOperation({ summary: 'Unread badge count (count only)' })
  @ApiEnvelopeResponse(UnreadCountDto)
  unreadCount(@CurrentTenant() tenant: TenantContext) {
    return this.inbox.unreadCount(tenant);
  }

  @Patch('read-all')
  @SkipAudit()
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  @ApiEnvelopeResponse(MarkAllReadResultDto)
  readAll(@CurrentTenant() tenant: TenantContext) {
    return this.inbox.markAllRead(tenant);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_MANAGE)
  @ApiOperation({ summary: 'Send a SYSTEM notification to users and/or a permission audience' })
  @ApiEnvelopeResponse(SendResultDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'NOTIFICATION_NO_RECIPIENTS / INVALID_PERMISSION_KEY')
  send(@CurrentTenant() tenant: TenantContext, @Body() dto: SendSystemNotificationDto) {
    return this.admin.sendSystem(tenant, dto);
  }

  @Patch(':id/read')
  @SkipAudit()
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  @ApiOperation({ summary: 'Mark one of my notifications as read' })
  @ApiEnvelopeResponse(NotificationResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'NOTIFICATION_NOT_FOUND')
  markRead(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.markRead(tenant, id);
  }

  @Delete(':id')
  @SkipAudit()
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  @ApiOperation({ summary: 'Remove one of my notifications from the inbox' })
  @ApiEnvelopeResponse(NotificationResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'NOTIFICATION_NOT_FOUND')
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.remove(tenant, id);
  }

  @Get(':id/deliveries')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  @ApiOperation({ summary: 'Delivery history of one of my notifications, per channel' })
  @ApiEnvelopeArrayResponse(NotificationDeliveryResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'NOTIFICATION_NOT_FOUND')
  deliveries(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.deliveries(tenant, id);
  }
}

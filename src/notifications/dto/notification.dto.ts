import { ApiProperty } from '@nestjs/swagger';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  NotificationType,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { toBoolean, trimString } from '../../common/utils/transforms';
import { IsDateOnly } from '../../common/validation/decorators';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: NotificationType, required: false })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiProperty({ enum: NotificationPriority, required: false })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isRead?: boolean;

  /** Created on or after this day (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  from?: string;

  /** Created on or before this day (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

/** A SYSTEM notification to chosen users and/or everyone holding a permission. */
export class SendSystemNotificationDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @ApiProperty({ enum: NotificationPriority, required: false })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  /** Recipient user ids (must be active members of the organization). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  userIds?: string[];

  /** Also send to every member holding this permission (e.g. "finance.read"). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  recipientPermission?: string;

  /** Limits permission-based recipients to members with access to this branch. */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class ListDeliveriesQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: NotificationChannel, required: false })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiProperty({ enum: NotificationDeliveryStatus, required: false })
  @IsOptional()
  @IsEnum(NotificationDeliveryStatus)
  status?: NotificationDeliveryStatus;

  @IsOptional()
  @IsUUID()
  notificationId?: string;

  @IsOptional()
  @IsDateOnly()
  from?: string;

  @IsOptional()
  @IsDateOnly()
  to?: string;
}

// ─── responses ──────────────────────────────────────────────────────────────

export class NotificationResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string | null;
  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;
  title!: string;
  message!: string;
  @ApiProperty({ enum: NotificationPriority })
  priority!: NotificationPriority;
  recipientUserId!: string;
  /** e.g. "Task", "Invoice", "Payment", "Lead", "Attendance". Open it via its own endpoint. */
  relatedType!: string | null;
  relatedId!: string | null;
  /** Template variables the notification was rendered with. */
  data!: Record<string, string | number>;
  isRead!: boolean;
  readAt!: Date | null;
  createdAt!: Date;
}

export class UnreadCountDto {
  count!: number;
}

export class MarkAllReadResultDto {
  /** Notifications that were unread and are now read. */
  updated!: number;
}

export class SendResultDto {
  /** Notifications created (one per recipient). */
  created!: number;
  /** Recipients skipped because this event already notified them. */
  duplicates!: number;
}

export class NotificationDeliveryResponseDto {
  id!: string;
  notificationId!: string;
  @ApiProperty({ enum: NotificationChannel })
  channel!: NotificationChannel;
  @ApiProperty({ enum: NotificationDeliveryStatus })
  status!: NotificationDeliveryStatus;
  provider!: string | null;
  providerMessageId!: string | null;
  sentAt!: Date | null;
  deliveredAt!: Date | null;
  failedAt!: Date | null;
  errorMessage!: string | null;
  attempts!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export class ProviderStatusDto {
  @ApiProperty({ enum: NotificationChannel })
  channel!: NotificationChannel;
  configured!: boolean;
  provider!: string | null;
}

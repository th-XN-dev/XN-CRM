import { ApiProperty } from '@nestjs/swagger';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';

export class NotificationPreferenceItemDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  telegramEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  items!: NotificationPreferenceItemDto[];
}

export class NotificationPreferenceResponseDto {
  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;
  inAppEnabled!: boolean;
  telegramEnabled!: boolean;
  emailEnabled!: boolean;
  smsEnabled!: boolean;
  pushEnabled!: boolean;
  /** Channels the organization does not let users switch off. */
  @ApiProperty({ enum: NotificationChannel, isArray: true })
  lockedChannels!: NotificationChannel[];
  /** false → policy defaults apply. */
  isCustomized!: boolean;
}

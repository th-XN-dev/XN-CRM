import { ApiProperty } from '@nestjs/swagger';
import { NotificationChannel, NotificationPriority, NotificationType } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateNotificationPolicyDto {
  /** Turn the type on/off for the organization (critical types can't be turned off). */
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  /** Members with this permission also receive the type; `null` → only the event subject. */
  @ApiProperty({ type: String, nullable: true, required: false, example: 'finance.read' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  recipientPermission?: string | null;

  /** Channels a user gets until they change their preferences. */
  @ApiProperty({ enum: NotificationChannel, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(NotificationChannel, { each: true })
  defaultChannels?: NotificationChannel[];

  /** Channels users cannot switch off. */
  @ApiProperty({ enum: NotificationChannel, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(NotificationChannel, { each: true })
  lockedChannels?: NotificationChannel[];
}

export class NotificationPolicyResponseDto {
  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;
  @ApiProperty({ enum: NotificationPriority })
  priority!: NotificationPriority;
  /** Critical types are always on and always delivered in-app. */
  critical!: boolean;
  isEnabled!: boolean;
  recipientPermission!: string | null;
  @ApiProperty({ enum: NotificationChannel, isArray: true })
  defaultChannels!: NotificationChannel[];
  @ApiProperty({ enum: NotificationChannel, isArray: true })
  lockedChannels!: NotificationChannel[];
  /** true when the organization overrides the code default. */
  isCustomized!: boolean;
}

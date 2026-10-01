import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { NotificationChannel, NotificationPriority, NotificationType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { toBoolean } from '../../common/utils/transforms';

export class CreateNotificationTemplateDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type!: NotificationType;

  /** IN_APP text is also the fallback for channels without their own template. */
  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  /** Only the type's variables are allowed, e.g. "To‘lov: {{amount}}". */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titleTemplate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  messageTemplate!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateNotificationTemplateDto extends PartialType(
  PickType(CreateNotificationTemplateDto, [
    'titleTemplate',
    'messageTemplate',
    'isActive',
  ] as const),
) {}

export class ListNotificationTemplatesDto extends PaginationQueryDto {
  @ApiProperty({ enum: NotificationType, required: false })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiProperty({ enum: NotificationChannel, required: false })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class NotificationTemplateResponseDto {
  id!: string;
  organizationId!: string;
  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;
  @ApiProperty({ enum: NotificationChannel })
  channel!: NotificationChannel;
  titleTemplate!: string;
  messageTemplate!: string;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

class DefaultTemplateDto {
  title!: string;
  message!: string;
}

export class NotificationTypeCatalogDto {
  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;
  @ApiProperty({ enum: NotificationPriority })
  priority!: NotificationPriority;
  critical!: boolean;
  /** Variables templates of this type may use. */
  variables!: string[];
  defaultTemplate!: DefaultTemplateDto;
}

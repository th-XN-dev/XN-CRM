import { ApiProperty } from '@nestjs/swagger';
import { NotificationPriority } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { trimString } from '../../common/utils/transforms';

export const ANNOUNCEMENT_AUDIENCES = ['everyone', 'users'] as const;

export class SendAnnouncementDto {
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

  /** everyone = all staff of the center (or of `branchId`); users = `userIds`. */
  @IsIn(ANNOUNCEMENT_AUDIENCES)
  @ApiProperty({ enum: ANNOUNCEMENT_AUDIENCES })
  audience!: (typeof ANNOUNCEMENT_AUDIENCES)[number];

  @ValidateIf((o: SendAnnouncementDto) => o.audience === 'users')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds?: string[];

  /** Only staff of this branch (everyone audience). */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export const OCCASIONS = [
  'BIRTHDAY',
  'WORK_ANNIVERSARY',
  'ACHIEVEMENT',
  'THANKS',
  'OTHER',
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export class SendCongratulationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  employeeIds!: string[];

  @IsIn(OCCASIONS)
  @ApiProperty({ enum: OCCASIONS })
  occasion!: Occasion;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}

export class OccasionsQueryDto {
  /** Look ahead this many days (today included). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  days: number = 14;
}

export class SentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}

export class SendResultDto {
  /** People who received it. */
  recipients!: number;
}

export class SentCommunicationDto {
  eventKey!: string;
  title!: string;
  message!: string;
  senderName!: string | null;
  occasion!: string | null;
  sentAt!: Date;
  recipients!: number;
  read!: number;
}

class OccasionEmployeeDto {
  id!: string;
  name!: string;
  /** Without a login the employee can't receive it in the app. */
  hasAccount!: boolean;
}

export class UpcomingOccasionDto {
  employee!: OccasionEmployeeDto;
  @ApiProperty({ enum: ['BIRTHDAY', 'WORK_ANNIVERSARY'] })
  occasion!: 'BIRTHDAY' | 'WORK_ANNIVERSARY';
  /** This year's date of the occasion (YYYY-MM-DD). */
  date!: string;
  daysLeft!: number;
  /** Age turned, or years at the center. */
  years!: number;
}

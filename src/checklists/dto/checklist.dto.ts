import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { TIME_REGEX } from '../../common/utils/times';
import { toBoolean, trimString } from '../../common/utils/transforms';
import { IsDateOnly } from '../../common/validation/decorators';

export class CreateChecklistDto {
  /** @example "Kassani tekshirish" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** Daily deadline, center time. @example "09:00" */
  @Matches(TIME_REGEX, { message: 'dueTime must be HH:MM' })
  dueTime!: string;

  /** Employee who does it every day. */
  @IsUUID()
  assigneeId!: string;

  /** Default: the selected branch (X-Branch-Id). */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** ISO weekdays (1 = Monday … 7 = Sunday). Default: every day. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];
}

export class UpdateChecklistDto extends PartialType(CreateChecklistDto) {
  /** false stops it from tomorrow on (today's item stays). */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListChecklistDayQueryDto {
  /** Default: today (center calendar). */
  @IsOptional()
  @IsDateOnly()
  date?: string;

  /** Only this employee's items. */
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Only the caller's own items (managers default to everything they may see). */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;
}

export class ListChecklistTemplatesQueryDto {
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

/** Tick it off and/or write the inline comment (autosaved by the UI). */
export class UpdateChecklistItemDto {
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  /** null clears it. */
  @ApiProperty({ type: String, nullable: true, required: false })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  comment?: string | null;
}

class PersonRefDto {
  id!: string;
  name!: string;
  userId!: string | null;
}

class BranchRefDto {
  id!: string;
  name!: string;
}

export class ChecklistTemplateDto {
  id!: string;
  title!: string;
  note!: string | null;
  dueTime!: string;
  weekdays!: number[];
  isActive!: boolean;
  assignee!: PersonRefDto;
  branch!: BranchRefDto;
  createdBy!: BranchRefDto;
  createdAt!: Date;
  /** The caller may edit/stop it. */
  canManage!: boolean;
}

class ChecklistItemTemplateDto {
  id!: string;
  title!: string;
  note!: string | null;
  dueTime!: string;
}

export class ChecklistItemDto {
  id!: string;
  date!: Date;
  dueAt!: Date;
  completedAt!: Date | null;
  comment!: string | null;
  commentAt!: Date | null;
  /** Past its time and not done. */
  overdue!: boolean;
  template!: ChecklistItemTemplateDto;
  assignee!: PersonRefDto;
  branch!: BranchRefDto;
  /** The caller may tick it and comment. */
  canEdit!: boolean;
}

class ChecklistDayStatsDto {
  total!: number;
  done!: number;
  overdue!: number;
}

export class ChecklistDayDto {
  date!: string;
  stats!: ChecklistDayStatsDto;
  items!: ChecklistItemDto[];
}

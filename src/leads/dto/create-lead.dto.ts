import { ApiProperty } from '@nestjs/swagger';
import { LeadPriority } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../common/utils/transforms';
import { IsPhone } from '../../common/validation/decorators';

/** Fields shared by create and update. */
export class LeadProfileDto {
  /** @example "Dilnoza Karimova" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  /** Main contact phone. @example "+998901234567" */
  @IsPhone()
  phone!: string;

  /** @example "+998911234567" */
  @IsOptional()
  @IsPhone()
  secondaryPhone?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  /** Optional pipeline stage the lead sits in. */
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @ApiProperty({ enum: LeadPriority, required: false, default: LeadPriority.MEDIUM })
  @IsOptional()
  @IsEnum(LeadPriority)
  priority?: LeadPriority;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  /** Next follow-up date/time (ISO 8601). @example "2026-10-05T09:00:00.000Z" */
  @IsOptional()
  @IsISO8601({ strict: true })
  nextFollowUpAt?: string;
}

export class CreateLeadDto extends LeadProfileDto {
  /** Home branch. Defaults to the selected branch (X-Branch-Id). */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Member the lead is assigned to on creation. */
  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

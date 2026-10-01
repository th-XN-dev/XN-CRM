import { ApiProperty } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChangeLeadStatusDto {
  @ApiProperty({ enum: LeadStatus })
  @IsEnum(LeadStatus)
  status!: LeadStatus;

  /** Move the lead to this pipeline stage as well (optional). */
  @IsOptional()
  @IsUUID()
  stageId?: string;

  /** Reason, required in practice for LOST. Recorded on the activity. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

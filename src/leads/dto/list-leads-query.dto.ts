import { ApiProperty } from '@nestjs/swagger';
import { LeadPriority, LeadStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';

export class ListLeadsQueryDto extends ListQueryDto {
  @ApiProperty({ enum: LeadStatus, required: false })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiProperty({ enum: LeadPriority, required: false })
  @IsOptional()
  @IsEnum(LeadPriority)
  priority?: LeadPriority;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  /** Exact phone match (any format; normalized before matching). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  /** Created on or after this date/time (ISO 8601). */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Created on or before this date/time (ISO 8601). */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'nextFollowUpAt', 'name', 'priority', 'status'])
  sortBy: 'createdAt' | 'updatedAt' | 'nextFollowUpAt' | 'name' | 'priority' | 'status' =
    'createdAt';
}

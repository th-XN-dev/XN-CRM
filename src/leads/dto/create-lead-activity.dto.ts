import { ApiProperty } from '@nestjs/swagger';
import { LeadActivityType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

/** Manual activity types the caller may log (system types are added by the service). */
export const MANUAL_ACTIVITY_TYPES = [
  LeadActivityType.CALL,
  LeadActivityType.MESSAGE,
  LeadActivityType.MEETING,
  LeadActivityType.TRIAL,
  LeadActivityType.NOTE,
] as const;

export class CreateLeadActivityDto {
  @ApiProperty({ enum: MANUAL_ACTIVITY_TYPES })
  @IsEnum(LeadActivityType)
  @IsIn(MANUAL_ACTIVITY_TYPES)
  type!: (typeof MANUAL_ACTIVITY_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ListActivitiesQueryDto extends PaginationQueryDto {}

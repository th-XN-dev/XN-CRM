import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';
import { IsDateOnly } from '../../common/validation/decorators';
import { CreateOrganizationDto } from '../../organizations/dto/create-organization.dto';
import { type CenterAvailability } from '../center-availability';
import { DirectorAccountDto, DirectorCredentialsDto } from './director.dto';

const CENTER_STATUSES = ['ACTIVE', 'FROZEN', 'ARCHIVED'] as const;
type CenterStatusName = (typeof CENTER_STATUSES)[number];
const AVAILABILITIES = ['ACTIVE', 'FROZEN', 'ARCHIVED', 'EXPIRED', 'NOT_STARTED'] as const;

/** Center = organization profile + activation period (+ its first director). */
export class CreateCenterDto extends CreateOrganizationDto {
  /** First usable day (center timezone). Omit = from today. */
  @IsOptional()
  @IsDateOnly()
  activeFrom?: string;

  /** Last usable day, inclusive. After it the center is frozen automatically. */
  @IsOptional()
  @IsDateOnly()
  activeUntil?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DirectorAccountDto)
  director?: DirectorAccountDto;
}

export class UpdateCenterDto extends PartialType(
  OmitType(CreateCenterDto, ['director', 'activeFrom', 'activeUntil'] as const),
) {
  /** null clears the start date. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsDateOnly()
  activeFrom?: string | null;

  /** null = no end date. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsDateOnly()
  activeUntil?: string | null;
}

export class FreezeCenterDto {
  /** Shown in the audit trail. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}

export class ActivateCenterDto {
  /** New last day; required when the old period has already ended. */
  @IsOptional()
  @IsDateOnly()
  activeUntil?: string;
}

export class ListCentersQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(CENTER_STATUSES)
  @ApiProperty({ enum: CENTER_STATUSES, required: false })
  status?: CenterStatusName;

  @IsOptional()
  @IsIn(['name', 'createdAt', 'activeUntil'])
  sortBy: 'name' | 'createdAt' | 'activeUntil' = 'createdAt';
}

class CenterCountsDto {
  subCenters!: number;
  branches!: number;
  members!: number;
  activeStudents!: number;
}

class CenterDirectorRefDto {
  id!: string;
  userId!: string;
  name!: string;
  mustChangePassword!: boolean;
}

export class CenterDto {
  id!: string;
  name!: string;
  slug!: string;
  logoUrl!: string | null;
  faviconUrl!: string | null;
  primaryColor!: string;
  secondaryColor!: string | null;
  phone!: string | null;
  email!: string | null;
  address!: string | null;
  timezone!: string;
  currency!: string;
  language!: string;
  @ApiProperty({ enum: CENTER_STATUSES })
  status!: CenterStatusName;
  /** What members experience right now (status + activation period). */
  @ApiProperty({ enum: AVAILABILITIES })
  availability!: CenterAvailability;
  activeFrom!: Date | null;
  activeUntil!: Date | null;
  statusChangedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  /** Address members open, when CENTER_URL_TEMPLATE is configured. */
  accessUrl!: string | null;
  counts!: CenterCountsDto;
  directors!: CenterDirectorRefDto[];
}

export class CreatedCenterDto {
  center!: CenterDto;
  /** Present when a director was given. */
  director!: DirectorCredentialsDto | null;
}

export class DeleteCenterDto {
  /** The center's slug, typed by the owner. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  confirm!: string;
}

const BULK_ACTIONS = ['archive', 'delete'] as const;

export class BulkCentersDto {
  @IsIn(BULK_ACTIONS)
  @ApiProperty({ enum: BULK_ACTIONS })
  action!: (typeof BULK_ACTIONS)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];

  /** Required for `delete`: the number of selected centers, typed by the owner. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  confirm?: string;
}

class BulkCenterResultDto {
  id!: string;
  ok!: boolean;
  /** Error code when this center was skipped. */
  code!: string | null;
}

export class BulkCentersResultDto {
  succeeded!: number;
  failed!: number;
  results!: BulkCenterResultDto[];
}

export class PurgeResultDto {
  id!: string;
  name!: string;
  deletedUsers!: number;
}

import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizePhone, PHONE_REGEX } from '../../common/utils/normalize';
import { SLUG_REGEX } from '../../common/utils/slug';
import { toLowerTrimmed, toUpperTrimmed, trimString } from '../../common/utils/transforms';

const STATUSES = ['ACTIVE', 'FROZEN', 'ARCHIVED'] as const;
type SubCenterStatusName = (typeof STATUSES)[number];

export class CreateSubCenterDto {
  /** @example "Jony Kids English" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  /** Short code, unique in the center. Stored upper-case. @example "KIDS" */
  @Transform(toUpperTrimmed)
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,31}$/, {
    message: 'code may contain letters, digits, "-" and "_" (max 32 chars)',
  })
  code!: string;

  /** Unique in the center; generated from the name when omitted. */
  @IsOptional()
  @Transform(toLowerTrimmed)
  @MinLength(2)
  @MaxLength(80)
  @Matches(SLUG_REGEX, { message: 'slug may contain lowercase letters, digits and single dashes' })
  slug?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  logoUrl?: string;

  /** Own accent "#RRGGBB" (the center brand is used when empty). */
  @IsOptional()
  @Transform(toUpperTrimmed)
  @Matches(/^#[0-9A-F]{6}$/, { message: 'primaryColor must be a hex color like #4F46E5' })
  primaryColor?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizePhone(value) : value,
  )
  @Matches(PHONE_REGEX, { message: 'phone must be in international format, e.g. +998901234567' })
  phone?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  address?: string;
}

export class UpdateSubCenterDto extends PartialType(CreateSubCenterDto) {}

export class SubCenterStatusDto {
  /** FROZEN/ARCHIVED: its branches can no longer be selected or written to. */
  @IsIn(STATUSES)
  @ApiProperty({ enum: STATUSES })
  status!: SubCenterStatusName;
}

export class ListSubCentersQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  @ApiProperty({ enum: STATUSES, required: false })
  status?: SubCenterStatusName;
}

class SubCenterBranchDto {
  id!: string;
  name!: string;
  code!: string;
  isActive!: boolean;
}

export class SubCenterDto {
  id!: string;
  organizationId!: string;
  name!: string;
  code!: string;
  slug!: string;
  logoUrl!: string | null;
  primaryColor!: string | null;
  phone!: string | null;
  address!: string | null;
  @ApiProperty({ enum: STATUSES })
  status!: SubCenterStatusName;
  createdAt!: Date;
  updatedAt!: Date;
  branches!: SubCenterBranchDto[];
}

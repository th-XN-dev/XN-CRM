import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';
import { toBoolean, toUpperTrimmed, trimString } from '../../common/utils/transforms';

/**
 * Shared shape of per-organization HR directories (positions, departments):
 * a name, a stable code unique per organization, and soft deactivation.
 */
export class CreateDirectoryItemDto {
  /** @example "Sales manager" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** Stable machine name, unique per organization (upper-cased). @example "SALES_MANAGER" */
  @Transform(toUpperTrimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateDirectoryItemDto extends PartialType(CreateDirectoryItemDto) {
  /** `true` re-activates a deactivated item. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class ListDirectoryQueryDto extends ListQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(['name', 'code', 'createdAt'])
  sortBy: 'name' | 'code' | 'createdAt' = 'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  override sortOrder: 'asc' | 'desc' = 'asc';
}

export class DirectoryItemResponseDto {
  id!: string;
  organizationId!: string;
  name!: string;
  code!: string;
  description!: string | null;
  isActive!: boolean;
  /** Number of non-terminated employees holding this item. */
  employeeCount!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export const DIRECTORY_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

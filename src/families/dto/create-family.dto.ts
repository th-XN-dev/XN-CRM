import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { toLowerTrimmed, trimString } from '../../common/utils/transforms';
import { IsPhone } from '../../common/validation/decorators';

export class CreateFamilyDto {
  /** @example "Karimovlar oilasi" */
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
  @Transform(toLowerTrimmed)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  /** Home branch. Defaults to the selected branch (X-Branch-Id). */
  @IsOptional()
  @IsUUID()
  primaryBranchId?: string;
}

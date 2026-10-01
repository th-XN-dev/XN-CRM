import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { normalizePhone, PHONE_REGEX } from '../../common/utils/normalize';
import { toUpperTrimmed, trimString } from '../../common/utils/transforms';

export class CreateBranchDto {
  /** @example "Termiz filial" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  /** Short code, unique within the organization. Stored upper-case. @example "TRM" */
  @Transform(toUpperTrimmed)
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,31}$/, {
    message: 'code may contain letters, digits, "-" and "_" (max 32 chars)',
  })
  code!: string;

  /** @example "+998761234567" */
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

  /** Parent sub-center (same center). Omit to place the branch directly under the center. */
  @IsOptional()
  @IsUUID()
  subCenterId?: string;
}

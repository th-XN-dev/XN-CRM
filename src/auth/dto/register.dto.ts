import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { normalizePhone, PHONE_REGEX } from '../../common/utils/normalize';
import { trimString } from '../../common/utils/transforms';

export class RegisterDto {
  /** @example "Jony Ergashev" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /**
   * Email or phone is required (both allowed).
   * @example "owner@jony.uz"
   */
  @ValidateIf((o: RegisterDto) => !o.phone || o.email !== undefined)
  @Transform(trimString)
  @IsEmail({}, { message: 'email must be a valid email (email or phone is required)' })
  @MaxLength(254)
  email?: string;

  /** @example "+998901234567" */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizePhone(value) : value,
  )
  @Matches(PHONE_REGEX, { message: 'phone must be in international format, e.g. +998901234567' })
  phone?: string;

  /** 8–128 characters. @example "S3cure!Passw0rd" */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

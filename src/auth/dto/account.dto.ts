import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizePhone, PHONE_REGEX } from '../../common/utils/normalize';
import { trimString } from '../../common/utils/transforms';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword!: string;

  /** 8–128 characters. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

/** Own profile. Changing the login (email/phone) needs the current password. */
export class UpdateProfileDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(trimString)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizePhone(value) : value,
  )
  @Matches(PHONE_REGEX, { message: 'phone must be in international format, e.g. +998901234567' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;
}

export class SessionDto {
  id!: string;
  userAgent!: string | null;
  ipAddress!: string | null;
  lastActiveAt!: Date;
  /** The session this request was made from. */
  current!: boolean;
}

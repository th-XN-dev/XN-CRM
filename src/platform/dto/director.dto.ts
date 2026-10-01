import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';
import { normalizePhone, PHONE_REGEX } from '../../common/utils/normalize';
import { trimString } from '../../common/utils/transforms';
import { ALL_PERMISSION_KEYS, type PermissionKey } from '../../permissions/permissions.catalog';

/**
 * The director's account. An existing user with this email/phone is linked
 * as is (their password is not touched); otherwise a new account is created
 * with a temporary password that must be changed at first sign-in.
 */
export class DirectorAccountDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** Email or phone is required (both allowed). */
  @ValidateIf((o: DirectorAccountDto) => !o.phone || o.email !== undefined)
  @Transform(trimString)
  @IsEmail({}, { message: 'email must be a valid email (email or phone is required)' })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizePhone(value) : value,
  )
  @Matches(PHONE_REGEX, { message: 'phone must be in international format, e.g. +998901234567' })
  phone?: string;

  /** 8–128 characters. Generated when omitted; returned once, stored only as a hash. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  temporaryPassword?: string;

  /**
   * Restrict the center's directors to these center permissions. Omit for
   * the full DIRECTOR role. Applies to every director of the center.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ALL_PERMISSION_KEYS.length)
  @IsIn(ALL_PERMISSION_KEYS, { each: true })
  @ApiProperty({ enum: ALL_PERMISSION_KEYS, isArray: true, required: false })
  permissions?: PermissionKey[];
}

export class CreateDirectorDto extends DirectorAccountDto {
  @IsUUID()
  centerId!: string;
}

export class UpdateDirectorDto extends PartialType(PickType(DirectorAccountDto, ['name'])) {
  /** New permission set for the center's directors; null = back to the full DIRECTOR role. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(ALL_PERMISSION_KEYS.length)
  @IsIn(ALL_PERMISSION_KEYS, { each: true })
  @ApiProperty({ enum: ALL_PERMISSION_KEYS, isArray: true, required: false, nullable: true })
  permissions?: PermissionKey[] | null;

  /** SUSPENDED → can't sign in to this center. */
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}

export class ListDirectorsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  centerId?: string;
}

class DirectorUserDto {
  id!: string;
  name!: string;
  email!: string | null;
  phone!: string | null;
  lastLoginAt!: Date | null;
  /** Still on the temporary password. */
  mustChangePassword!: boolean;
}

class DirectorCenterRefDto {
  id!: string;
  name!: string;
  slug!: string;
  @ApiProperty({ enum: ['ACTIVE', 'FROZEN', 'ARCHIVED'] })
  status!: 'ACTIVE' | 'FROZEN' | 'ARCHIVED';
}

export class DirectorDto {
  /** Membership id — the director's handle in this API. */
  id!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INVITED', 'SUSPENDED'] })
  status!: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  createdAt!: Date;
  user!: DirectorUserDto;
  center!: DirectorCenterRefDto;
  /** Center-specific permission set (null = the full DIRECTOR role). */
  permissions!: string[] | null;
}

/** A director as just created/reset: the temporary password is shown this once. */
export class DirectorCredentialsDto {
  director!: DirectorDto;
  /** Sign-in login (email, else phone). */
  login!: string;
  /** Null when an existing account was linked (its password is unchanged). */
  temporaryPassword!: string | null;
}

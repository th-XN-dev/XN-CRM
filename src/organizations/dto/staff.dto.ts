import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { GRANTABLE_PERMISSIONS } from '../../permissions/permissions.catalog';
import { STAFF_ROLE_KEYS } from '../../roles/roles.catalog';

export class CreateStaffDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** Email or phone is required. An existing account with it is linked as is. */
  @ValidateIf((o: CreateStaffDto) => !o.phone || o.email !== undefined)
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

  /** Generated when omitted; returned once, must be changed at first sign-in. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  temporaryPassword?: string;

  @IsIn(STAFF_ROLE_KEYS)
  @ApiProperty({ enum: STAFF_ROLE_KEYS })
  roleKey!: (typeof STAFF_ROLE_KEYS)[number];

  /** Every branch of the center, now and later. */
  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  branchIds?: string[];

  /** Extra permissions on top of the role (only grantable ones the caller holds). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(GRANTABLE_PERMISSIONS.length)
  @IsIn(GRANTABLE_PERMISSIONS, { each: true })
  @ApiProperty({ enum: GRANTABLE_PERMISSIONS, isArray: true, required: false })
  grantedPermissions?: string[];
}

export class UpdateStaffDto extends PartialType(
  PickType(CreateStaffDto, ['roleKey', 'allBranches', 'branchIds', 'grantedPermissions'] as const),
) {
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}

export class ListStaffQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

class StaffUserDto {
  id!: string;
  name!: string;
  email!: string | null;
  phone!: string | null;
  lastLoginAt!: Date | null;
  mustChangePassword!: boolean;
}

class StaffBranchDto {
  id!: string;
  name!: string;
}

export class StaffMemberDto {
  /** Membership id. */
  id!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INVITED', 'SUSPENDED'] })
  status!: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  role!: string;
  @ApiProperty({ enum: ['DIRECTOR', 'STAFF'] })
  tier!: 'DIRECTOR' | 'STAFF';
  allBranches!: boolean;
  branches!: StaffBranchDto[];
  /** Extra permissions on top of the role. */
  grantedPermissions!: string[];
  createdAt!: Date;
  user!: StaffUserDto;
}

export class StaffCredentialsDto {
  member!: StaffMemberDto;
  login!: string;
  /** Null when an existing account was linked. */
  temporaryPassword!: string | null;
}

export class AssignableRoleDto {
  key!: string;
  name!: string;
  description!: string | null;
  permissions!: string[];
  /** False when the role grants more than the caller has. */
  assignable!: boolean;
}

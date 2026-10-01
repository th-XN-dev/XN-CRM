import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { EmployeeStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/pagination-query.dto';
import { toBoolean, toLowerTrimmed, trimString } from '../../../common/utils/transforms';
import { IsDateOnly, IsPhone } from '../../../common/validation/decorators';

/** Statuses an employee can be created with (TERMINATED only via update/delete). */
const INITIAL_STATUSES = [
  EmployeeStatus.ACTIVE,
  EmployeeStatus.ON_LEAVE,
  EmployeeStatus.INACTIVE,
] as const;

export class CreateEmployeeDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  middleName?: string;

  /** @example "+998901234567" */
  @IsPhone()
  phone!: string;

  @IsOptional()
  @Transform(toLowerTrimmed)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsDateOnly()
  birthDate?: string;

  /** Defaults to today (organization timezone). */
  @IsOptional()
  @IsDateOnly()
  hireDate?: string;

  @IsOptional()
  @IsUUID()
  positionId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  /** Links a CRM login: must be an active member of the organization, one employee per user. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ enum: INITIAL_STATUSES, required: false, default: EmployeeStatus.ACTIVE })
  @IsOptional()
  @IsIn(INITIAL_STATUSES)
  status?: (typeof INITIAL_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Primary branch; defaults to the selected `X-Branch-Id`. */
  @IsOptional()
  @IsUUID()
  primaryBranchId?: string;

  /** Additional branches the employee works in (the primary one is added automatically). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  branchIds?: string[];
}

/**
 * Branches are managed via `/employees/:id/branches`. `userId: null` unlinks the login.
 * Setting `status: TERMINATED` stamps `terminationDate` (today unless given);
 * any other status clears it.
 */
export class UpdateEmployeeDto extends PartialType(
  OmitType(CreateEmployeeDto, ['primaryBranchId', 'branchIds', 'status', 'userId'] as const),
) {
  @ApiProperty({ enum: EmployeeStatus, required: false })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsDateOnly()
  terminationDate?: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  userId?: string | null;
}

export class ListEmployeesQueryDto extends ListQueryDto {
  @ApiProperty({ enum: EmployeeStatus, required: false })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsUUID()
  positionId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  /** Employees working in this branch (any of their branches). */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** `true` → only employees with a CRM login; `false` → only without. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasUser?: boolean;

  @IsOptional()
  @IsIn(['lastName', 'firstName', 'hireDate', 'createdAt'])
  sortBy: 'lastName' | 'firstName' | 'hireDate' | 'createdAt' = 'lastName';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  override sortOrder: 'asc' | 'desc' = 'asc';
}

export class AddEmployeeBranchDto {
  @IsUUID()
  branchId!: string;

  /** Make it the primary branch (the previous primary stays as a regular branch). */
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

class RefDto {
  id!: string;
  name!: string;
}

class CodedRefDto extends RefDto {
  code!: string;
}

class UserRefDto {
  id!: string;
  name!: string;
  email!: string | null;
}

export class EmployeeBranchResponseDto {
  id!: string;
  branchId!: string;
  isPrimary!: boolean;
  createdAt!: Date;
  branch!: CodedRefDto;
}

export class EmployeeResponseDto {
  id!: string;
  organizationId!: string;
  primaryBranchId!: string;
  userId!: string | null;
  firstName!: string;
  lastName!: string;
  middleName!: string | null;
  phone!: string;
  email!: string | null;
  birthDate!: Date | null;
  hireDate!: Date;
  terminationDate!: Date | null;
  positionId!: string | null;
  departmentId!: string | null;
  @ApiProperty({ enum: EmployeeStatus })
  status!: EmployeeStatus;
  notes!: string | null;
  position!: CodedRefDto | null;
  department!: CodedRefDto | null;
  primaryBranch!: RefDto;
  user!: UserRefDto | null;
  @ApiProperty({ type: [EmployeeBranchResponseDto] })
  branches!: EmployeeBranchResponseDto[];
  createdAt!: Date;
  updatedAt!: Date;
}

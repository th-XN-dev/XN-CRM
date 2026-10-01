import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../common/utils/transforms';
import { IsDateOnly, IsPhone } from '../../common/validation/decorators';
import { CreateFamilyDto } from '../../families/dto/create-family.dto';

export class StudentProfileDto {
  /** @example "Ali" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  /** @example "Karimov" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(80)
  middleName?: string;

  /** @example "2014-05-17" */
  @IsOptional()
  @IsDateOnly()
  birthDate?: string;

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsPhone()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class CreateStudentDto extends StudentProfileDto {
  /** Existing family. Exactly one of `familyId` / `family` is required. */
  @ValidateIf((o: CreateStudentDto) => o.family === undefined)
  @IsUUID()
  familyId?: string;

  /** New family, created in the same transaction as the student. */
  @ValidateIf((o: CreateStudentDto) => o.familyId === undefined)
  @ValidateNested()
  @Type(() => CreateFamilyDto)
  family?: CreateFamilyDto;

  /** Home branch. Defaults to X-Branch-Id, then to the family's primary branch. */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Defaults to today (organization timezone). @example "2026-09-01" */
  @IsOptional()
  @IsDateOnly()
  joinedAt?: string;
}

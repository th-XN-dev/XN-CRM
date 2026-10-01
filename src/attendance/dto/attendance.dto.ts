import { ApiProperty } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { IsDateOnly } from '../../common/validation/decorators';

export class AttendanceRecordDto {
  @IsUUID()
  enrollmentId!: string;

  @ApiProperty({ enum: AttendanceStatus, example: AttendanceStatus.PRESENT })
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  /** Only for PRESENT/LATE. ISO 8601 timestamp. @example "2026-10-01T13:32:00Z" */
  @IsOptional()
  @IsISO8601({ strict: true })
  checkInAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class MarkGroupAttendanceDto {
  /** Lesson date (organization calendar). Future dates need attendance.mark_future. @example "2026-10-01" */
  @IsDateOnly()
  date!: string;

  /** Creates or updates one mark per enrollment (idempotent per enrollment + date). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records!: AttendanceRecordDto[];
}

export class UpdateAttendanceDto {
  @ApiProperty({ enum: AttendanceStatus, required: false })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsISO8601({ strict: true })
  checkInAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class GroupAttendanceQueryDto {
  /** Defaults to today (organization timezone). @example "2026-10-01" */
  @IsOptional()
  @IsDateOnly()
  date?: string;
}

export class DateRangeQueryDto {
  /** Inclusive. @example "2026-09-01" */
  @IsOptional()
  @IsDateOnly()
  from?: string;

  /** Inclusive. @example "2026-09-30" */
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

export class StudentAttendanceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @IsOptional()
  @IsDateOnly()
  to?: string;

  @ApiProperty({ enum: AttendanceStatus, required: false })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;
}

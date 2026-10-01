import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/pagination-query.dto';
import { toBoolean } from '../../../common/utils/transforms';
import { IsDateOnly } from '../../../common/validation/decorators';
import { InvoiceApiStatus } from '../../common/invoice-status';

export class ListInvoicesDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  familyId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiProperty({ enum: InvoiceApiStatus, required: false })
  @IsOptional()
  @IsEnum(InvoiceApiStatus)
  status?: InvoiceApiStatus;

  /** Shortcut for the overdue subset (unpaid and past due). */
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  /** Issued on or after this date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  from?: string;

  /** Issued on or before this date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @IsOptional()
  @IsIn(['issueDate', 'dueDate', 'createdAt', 'finalAmount'])
  sortBy: 'issueDate' | 'dueDate' | 'createdAt' | 'finalAmount' = 'issueDate';
}

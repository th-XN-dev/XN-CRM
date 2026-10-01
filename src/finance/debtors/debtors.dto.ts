import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/pagination/pagination-query.dto';
import { PaginationMetaDto } from '../../common/swagger/common-responses.dto';
import { toBoolean } from '../../common/utils/transforms';
import { IsDateOnly, IsMoney } from '../../common/validation/decorators';

export class ListDebtorsDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Only families with debt past its due date. */
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  /** Only families with a partly paid invoice. */
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  partial?: boolean;

  /** Count only invoices due on or before this date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  dueTo?: string;

  /** Only families owing at least this much. */
  @ApiProperty({ required: false, example: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsMoney()
  minAmount?: number;

  @IsOptional()
  @IsIn(['amount', 'oldestDueDate', 'name'])
  sortBy: 'amount' | 'oldestDueDate' | 'name' = 'amount';
}

/** One payer inside a family: a student, or `studentId: null` for family-level charges. */
class DebtorStudentDto {
  studentId!: string | null;
  firstName!: string | null;
  lastName!: string | null;
  invoices!: number;
  amount!: string;
}

/** Money fields are decimal strings. */
class DebtorFamilyDto {
  familyId!: string;
  familyName!: string;
  phone!: string;
  /** Students with an unpaid balance. */
  studentsCount!: number;
  invoices!: number;
  amount!: string;
  overdueAmount!: string;
  oldestDueDate!: Date;
  hasPartial!: boolean;
  @ApiProperty({ type: [DebtorStudentDto] })
  students!: DebtorStudentDto[];
}

export class DebtorsPageDto {
  /** Totals over every family matching the filters (not only this page). */
  totalDebt!: string;
  overdueDebt!: string;
  @ApiProperty({ type: [DebtorFamilyDto] })
  items!: DebtorFamilyDto[];
  meta!: PaginationMetaDto;
}

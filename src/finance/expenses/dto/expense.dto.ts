import { ApiProperty } from '@nestjs/swagger';
import { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { IsDateOnly, IsPositiveMoney } from '../../../common/validation/decorators';

export class CreateExpenseDto {
  @ApiProperty({ enum: ExpenseCategory })
  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @ApiProperty({ example: 1200000 })
  @IsPositiveMoney()
  amount!: number;

  /** CASH is paid out of the caller's open drawer in the branch. */
  @ApiProperty({ enum: ExpensePaymentMethod })
  @IsEnum(ExpensePaymentMethod)
  paymentMethod!: ExpensePaymentMethod;

  /** Defaults to today (organization timezone). */
  @IsOptional()
  @IsDateOnly()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Defaults to the selected `X-Branch-Id`. */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/**
 * Branch and payment method are fixed (they decide which drawer the cash left).
 * The amount of a CASH expense can't change once its drawer is closed.
 */
export class UpdateExpenseDto {
  @ApiProperty({ enum: ExpenseCategory, required: false })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsPositiveMoney()
  amount?: number;

  @IsOptional()
  @IsDateOnly()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class ListExpensesDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ enum: ExpenseCategory, required: false })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiProperty({ enum: ExpensePaymentMethod, required: false })
  @IsOptional()
  @IsEnum(ExpensePaymentMethod)
  paymentMethod?: ExpensePaymentMethod;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsOptional()
  @IsUUID()
  cashSessionId?: string;

  /** Spent on or after this date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  from?: string;

  /** Spent on or before this date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @IsOptional()
  @IsIn(['expenseDate', 'amount', 'createdAt'])
  sortBy: 'expenseDate' | 'amount' | 'createdAt' = 'expenseDate';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

class NamedRefDto {
  id!: string;
  name!: string;
}

/** `amount` serializes as a decimal string. */
export class ExpenseResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  @ApiProperty({ enum: ExpenseCategory })
  category!: ExpenseCategory;
  amount!: string;
  @ApiProperty({ enum: ExpensePaymentMethod })
  paymentMethod!: ExpensePaymentMethod;
  description!: string | null;
  expenseDate!: Date;
  createdById!: string;
  cashSessionId!: string | null;
  createdBy!: NamedRefDto;
  branch!: NamedRefDto;
  createdAt!: Date;
  updatedAt!: Date;
}

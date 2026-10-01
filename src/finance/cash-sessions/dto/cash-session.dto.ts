import { ApiProperty } from '@nestjs/swagger';
import { CashSessionStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { IsDateOnly, IsMoney } from '../../../common/validation/decorators';

export class OpenCashSessionDto {
  @ApiProperty({ description: 'Cash in the drawer at opening', example: 100000 })
  @IsMoney()
  openingBalance!: number;

  /** Defaults to the selected `X-Branch-Id`. */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CloseCashSessionDto {
  @ApiProperty({ description: 'Cash counted in the drawer at closing', example: 1350000 })
  @IsMoney()
  closingBalance!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ListCashSessionsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  cashierId?: string;

  @ApiProperty({ enum: CashSessionStatus, required: false })
  @IsOptional()
  @IsEnum(CashSessionStatus)
  status?: CashSessionStatus;

  /** Opened on or after this date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  from?: string;

  /** Opened on or before this date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

class UserRefDto {
  id!: string;
  name!: string;
}

class NamedRefDto {
  id!: string;
  name!: string;
}

/** Money fields serialize as decimal strings. */
export class CashSessionResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  cashierId!: string;
  @ApiProperty({ enum: CashSessionStatus })
  status!: CashSessionStatus;
  openedAt!: Date;
  closedAt!: Date | null;
  openingBalance!: string;
  /** Set at close: opening + cash in − cash out. */
  expectedBalance!: string | null;
  closingBalance!: string | null;
  difference!: string | null;
  note!: string | null;
  cashier!: UserRefDto;
  branch!: NamedRefDto;
  createdAt!: Date;
  updatedAt!: Date;
}

export class CashSessionTotalsDto {
  /** Σ CASH payments received in this session. */
  cashIn!: string;
  /** Σ refunds of CASH payments paid out of this drawer. */
  refundsOut!: string;
  /** Σ CASH expenses paid out of this drawer. */
  expensesOut!: string;
  /** opening + cashIn − refundsOut − expensesOut (live for an open session). */
  expectedBalance!: string;
  paymentCount!: number;
}

export class CashSessionDetailDto extends CashSessionResponseDto {
  totals!: CashSessionTotalsDto;
}

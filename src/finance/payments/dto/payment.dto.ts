import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { IsDateOnly, IsPositiveMoney } from '../../../common/validation/decorators';

export class CreatePaymentDto {
  @IsUUID()
  invoiceId!: string;

  @ApiProperty({ example: 250000 })
  @IsPositiveMoney()
  amount!: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  /** Defaults to today (organization timezone); never in the future. */
  @IsOptional()
  @IsDateOnly()
  paymentDate?: string;

  /**
   * Client idempotency key, unique per organization. Re-sending the same key
   * returns `409 PAYMENT_ALREADY_EXISTS` with the original payment instead of
   * charging twice. Generated server-side when omitted.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  transactionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CreateRefundDto {
  @ApiProperty({ example: 50000 })
  @IsPositiveMoney()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class ListPaymentsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsUUID()
  familyId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  cashierId?: string;

  @IsOptional()
  @IsUUID()
  cashSessionId?: string;

  @ApiProperty({ enum: PaymentMethod, required: false })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  /** Paid on or after this date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  from?: string;

  /** Paid on or before this date (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

class NamedRefDto {
  id!: string;
  name!: string;
}

class InvoiceRefDto {
  id!: string;
  invoiceNumber!: string;
}

/** Money fields serialize as decimal strings. */
export class PaymentResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  invoiceId!: string;
  familyId!: string;
  studentId!: string | null;
  amount!: string;
  @ApiProperty({ enum: PaymentMethod })
  method!: PaymentMethod;
  paymentDate!: Date;
  cashierId!: string;
  cashSessionId!: string | null;
  transactionId!: string;
  note!: string | null;
  createdAt!: Date;
  invoice!: InvoiceRefDto;
  family!: NamedRefDto;
  cashier!: NamedRefDto;
  /** Σ refunds of this payment. */
  refunded!: string;
}

export class RefundResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  paymentId!: string;
  invoiceId!: string;
  amount!: string;
  reason!: string;
  refundedById!: string;
  refundedAt!: Date;
  cashSessionId!: string | null;
  createdAt!: Date;
}

export class PaymentDetailDto extends PaymentResponseDto {
  @ApiProperty({ type: [RefundResponseDto] })
  refunds!: RefundResponseDto[];
}

export class ListRefundsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  familyId?: string;

  @IsOptional()
  @IsUUID()
  paymentId?: string;

  /** Refunded on or after this date (YYYY-MM-DD, organization calendar). */
  @IsOptional()
  @IsDateOnly()
  from?: string;

  /** Refunded on or before this date (YYYY-MM-DD, organization calendar). */
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

class RefundPaymentRefDto {
  id!: string;
  amount!: string;
  @ApiProperty({ enum: PaymentMethod })
  method!: PaymentMethod;
  paymentDate!: Date;
}

/** A refund with what it undoes: the payment, its invoice and family, and who refunded. */
export class RefundListItemDto extends RefundResponseDto {
  payment!: RefundPaymentRefDto;
  invoice!: InvoiceRefDto;
  family!: NamedRefDto;
  refundedBy!: NamedRefDto;
}

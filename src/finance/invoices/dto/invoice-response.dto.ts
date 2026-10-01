import { ApiProperty } from '@nestjs/swagger';
import { InvoiceApiStatus } from '../../common/invoice-status';

class NamedRefDto {
  id!: string;
  name!: string;
}

class StudentRefDto {
  id!: string;
  firstName!: string;
  lastName!: string;
}

/** Money fields serialize as decimal strings, e.g. "450000" or "1250.50". */
export class InvoiceResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  familyId!: string;
  studentId!: string | null;
  invoiceNumber!: string;
  issueDate!: Date;
  dueDate!: Date;
  amount!: string;
  discount!: string;
  finalAmount!: string;
  /** Σ payments. */
  paid!: string;
  /** Σ refunds. */
  refunded!: string;
  /** finalAmount − (paid − refunded); may be negative if over-refunded. */
  debt!: string;
  @ApiProperty({ enum: InvoiceApiStatus, description: 'Stored status, with OVERDUE derived live' })
  status!: InvoiceApiStatus;
  description!: string | null;
  createdById!: string;
  cancelledAt!: Date | null;
  cancelReason!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class InvoiceListItemDto extends InvoiceResponseDto {
  family!: NamedRefDto;
  student!: StudentRefDto | null;
  branch!: NamedRefDto;
}

class PaymentLineDto {
  id!: string;
  amount!: string;
  method!: string;
  paymentDate!: Date;
  cashierId!: string;
  transactionId!: string;
  note!: string | null;
  createdAt!: Date;
}

class RefundLineDto {
  id!: string;
  paymentId!: string;
  amount!: string;
  reason!: string;
  refundedById!: string;
  refundedAt!: Date;
}

export class InvoiceDetailDto extends InvoiceListItemDto {
  @ApiProperty({ type: [PaymentLineDto] })
  payments!: PaymentLineDto[];
  @ApiProperty({ type: [RefundLineDto] })
  refunds!: RefundLineDto[];
}

export class FinanceSummaryDto {
  familyId!: string | null;
  studentId!: string | null;
  /** Σ finalAmount of non-cancelled invoices. */
  billed!: string;
  paid!: string;
  refunded!: string;
  /** Outstanding debt across the family's open invoices. */
  debt!: string;
  invoiceCount!: number;
  overdueCount!: number;
}

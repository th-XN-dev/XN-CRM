import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDateOnly, IsMoney, IsPositiveMoney } from '../../../common/validation/decorators';

/**
 * Family/student are fixed once an invoice exists; only money terms, due date
 * and description can change, and never below what is already (net) paid.
 */
export class UpdateInvoiceDto {
  @IsOptional()
  @IsPositiveMoney()
  amount?: number;

  @IsOptional()
  @IsMoney()
  discount?: number;

  @IsOptional()
  @IsDateOnly()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

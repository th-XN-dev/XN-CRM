import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsDateOnly, IsMoney, IsPositiveMoney } from '../../../common/validation/decorators';

export class CreateInvoiceDto {
  @IsUUID()
  familyId!: string;

  /** Optional: charge tied to one student of the family; omit for a family-level charge. */
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiProperty({ description: 'Gross amount before discount', example: 500000 })
  @IsPositiveMoney()
  amount!: number;

  @ApiProperty({ description: 'Discount off the amount (0 ≤ discount ≤ amount)', example: 50000 })
  @IsOptional()
  @IsMoney()
  discount?: number;

  /** Defaults to today (organization timezone). */
  @IsOptional()
  @IsDateOnly()
  issueDate?: string;

  @IsDateOnly()
  dueDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Branch the charge is raised in; defaults to the selected `X-Branch-Id`. */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

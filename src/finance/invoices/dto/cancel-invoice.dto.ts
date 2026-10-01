import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

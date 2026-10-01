import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { IsDateOnly } from '../../common/validation/decorators';

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** e.g. PAYMENT_CREATED, LOGIN, UPDATE. */
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/, { message: 'action must be an UPPER_SNAKE_CASE action' })
  action?: string;

  /** e.g. Payment, Student, Courses. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Created on or after this day (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  from?: string;

  /** Created on or before this day (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

class ActorDto {
  id!: string;
  name!: string;
}

export class AuditLogResponseDto {
  id!: string;
  organizationId!: string | null;
  branchId!: string | null;
  userId!: string | null;
  action!: string;
  entityType!: string | null;
  entityId!: string | null;
  /** Sanitized: passwords, tokens and secrets are never stored. */
  oldData!: Record<string, unknown> | null;
  newData!: Record<string, unknown> | null;
  ipAddress!: string | null;
  userAgent!: string | null;
  /** Same id as the request's `X-Request-ID` and log lines. */
  requestId!: string | null;
  createdAt!: Date;
  user!: ActorDto | null;
}

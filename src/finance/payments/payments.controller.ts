import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import { PERMISSIONS } from '../../permissions/permissions.catalog';
import { CurrentTenant } from '../../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../../tenancy/tenant-context';
import {
  CreatePaymentDto,
  CreateRefundDto,
  ListPaymentsDto,
  ListRefundsDto,
  PaymentDetailDto,
  PaymentResponseDto,
  RefundListItemDto,
  RefundResponseDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Finance · Payments')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.FINANCE_PAYMENT_CREATE)
  @ApiOperation({
    summary: 'Receive a payment for an invoice (CASH requires an open cash session)',
  })
  @ApiEnvelopeResponse(PaymentResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'PAYMENT_ALREADY_EXISTS / PAYMENT_EXCEEDS_BALANCE / INVOICE_CANCELLED / CASH_SESSION_REQUIRED',
  )
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'PAYMENT_DATE_IN_FUTURE')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePaymentDto) {
    return this.payments.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.FINANCE_PAYMENT_READ)
  @ApiOperation({ summary: 'List payments' })
  @ApiPaginatedResponse(PaymentResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListPaymentsDto) {
    return this.payments.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.FINANCE_PAYMENT_READ)
  @ApiOperation({ summary: 'Payment with its refunds' })
  @ApiEnvelopeResponse(PaymentDetailDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'PAYMENT_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.findOne(tenant, id);
  }

  @Post(':id/refunds')
  @RequirePermissions(PERMISSIONS.FINANCE_REFUND_CREATE)
  @ApiOperation({ summary: 'Refund (part of) a payment; re-opens the invoice debt' })
  @ApiEnvelopeResponse(RefundResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'REFUND_EXCEEDS_PAYMENT / CASH_SESSION_REQUIRED')
  refund(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRefundDto,
  ) {
    return this.payments.refund(tenant, id, dto);
  }
}

@ApiTags('Finance · Payments')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('refunds')
export class RefundsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.FINANCE_PAYMENT_READ)
  @ApiOperation({ summary: 'List refunds, newest first' })
  @ApiPaginatedResponse(RefundListItemDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListRefundsDto) {
    return this.payments.listRefunds(tenant, query);
  }
}

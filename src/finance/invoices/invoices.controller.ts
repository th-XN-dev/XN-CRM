import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { FinanceSummaryQueryDto } from './dto/finance-summary-query.dto';
import {
  FinanceSummaryDto,
  InvoiceDetailDto,
  InvoiceListItemDto,
} from './dto/invoice-response.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('Finance · Invoices')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.FINANCE_INVOICE_CREATE)
  @ApiOperation({ summary: 'Issue an invoice to a family (optionally for one student)' })
  @ApiEnvelopeResponse(InvoiceListItemDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'INVALID_DISCOUNT / STUDENT_NOT_IN_FAMILY')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({ summary: 'Search invoices (status incl. derived OVERDUE, debt per row)' })
  @ApiPaginatedResponse(InvoiceListItemDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListInvoicesDto) {
    return this.invoices.list(tenant, query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({ summary: 'Billed / paid / debt totals for a family or a student' })
  @ApiEnvelopeResponse(FinanceSummaryDto)
  summary(@CurrentTenant() tenant: TenantContext, @Query() query: FinanceSummaryQueryDto) {
    return this.invoices.summary(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({ summary: 'Invoice with its payments and refunds' })
  @ApiEnvelopeResponse(InvoiceDetailDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.FINANCE_INVOICE_UPDATE)
  @ApiOperation({ summary: 'Edit amount, discount, due date or description' })
  @ApiEnvelopeResponse(InvoiceListItemDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'INVOICE_CANCELLED / INVOICE_AMOUNT_BELOW_PAID')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoices.update(tenant, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.FINANCE_INVOICE_CANCEL)
  @ApiOperation({ summary: 'Cancel an invoice that holds no money' })
  @ApiEnvelopeResponse(InvoiceListItemDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'INVOICE_CANCELLED / INVOICE_HAS_PAYMENTS')
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelInvoiceDto,
  ) {
    return this.invoices.cancel(tenant, id, dto);
  }
}

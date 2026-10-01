import {
  Body,
  Controller,
  Get,
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
import {
  CreateExpenseDto,
  ExpenseResponseDto,
  ListExpensesDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('Finance · Expenses')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.FINANCE_EXPENSE_CREATE)
  @ApiOperation({ summary: 'Record an expense (CASH is paid from the open drawer)' })
  @ApiEnvelopeResponse(ExpenseResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'CASH_SESSION_REQUIRED')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.FINANCE_EXPENSE_READ)
  @ApiOperation({ summary: 'List expenses' })
  @ApiPaginatedResponse(ExpenseResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListExpensesDto) {
    return this.expenses.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.FINANCE_EXPENSE_READ)
  @ApiOperation({ summary: 'Get an expense' })
  @ApiEnvelopeResponse(ExpenseResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'EXPENSE_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.FINANCE_EXPENSE_UPDATE)
  @ApiOperation({ summary: 'Edit category, amount, date or description' })
  @ApiEnvelopeResponse(ExpenseResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'CASH_SESSION_CLOSED')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.update(tenant, id, dto);
  }
}

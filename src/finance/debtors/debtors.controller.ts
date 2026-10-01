import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/swagger/api-responses';
import { PERMISSIONS } from '../../permissions/permissions.catalog';
import { CurrentTenant } from '../../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../../tenancy/tenant-context';
import { DebtorsPageDto, ListDebtorsDto } from './debtors.dto';
import { DebtorsService } from './debtors.service';

@ApiTags('Finance · Invoices')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('debtors')
export class DebtorsController {
  constructor(private readonly debtors: DebtorsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({
    summary: 'Families with unpaid invoices, largest debt first, with a per-student breakdown',
  })
  @ApiEnvelopeResponse(DebtorsPageDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListDebtorsDto) {
    return this.debtors.list(tenant, query);
  }
}

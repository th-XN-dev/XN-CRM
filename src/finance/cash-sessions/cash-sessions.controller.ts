import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { CashSessionsService } from './cash-sessions.service';
import {
  CashSessionDetailDto,
  CashSessionResponseDto,
  CloseCashSessionDto,
  ListCashSessionsDto,
  OpenCashSessionDto,
} from './dto/cash-session.dto';

@ApiTags('Finance · Cash sessions')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly sessions: CashSessionsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.FINANCE_CASH_OPEN)
  @ApiOperation({ summary: 'Open own cash drawer in a branch' })
  @ApiEnvelopeResponse(CashSessionDetailDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'CASH_SESSION_ALREADY_OPEN')
  open(@CurrentTenant() tenant: TenantContext, @Body() dto: OpenCashSessionDto) {
    return this.sessions.open(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.FINANCE_CASH_READ)
  @ApiOperation({ summary: 'List cash sessions' })
  @ApiPaginatedResponse(CashSessionResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListCashSessionsDto) {
    return this.sessions.list(tenant, query);
  }

  @Get('current')
  @RequirePermissions(PERMISSIONS.FINANCE_CASH_READ)
  @ApiOperation({ summary: "The caller's open cash session with live totals (null if none)" })
  @ApiEnvelopeResponse(CashSessionDetailDto)
  current(@CurrentTenant() tenant: TenantContext) {
    return this.sessions.current(tenant);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.FINANCE_CASH_READ)
  @ApiOperation({ summary: 'Cash session with cash in / out totals' })
  @ApiEnvelopeResponse(CashSessionDetailDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'CASH_SESSION_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.findOne(tenant, id);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.FINANCE_CASH_CLOSE)
  @ApiOperation({ summary: 'Close own drawer with the counted cash; computes the difference' })
  @ApiEnvelopeResponse(CashSessionDetailDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'CASH_SESSION_CLOSED')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'CASH_SESSION_NOT_OWNER')
  close(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCashSessionDto,
  ) {
    return this.sessions.close(tenant, id, dto);
  }
}

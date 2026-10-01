import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
} from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { AuditService } from './audit.service';
import { AuditLogResponseDto, ListAuditLogsQueryDto } from './dto/audit-log.dto';

/** Read-only by design: there is no endpoint that changes or removes audit rows. */
@ApiTags('Audit')
@ApiBearerAuth()
@OrganizationScoped()
@RequirePermissions(PERMISSIONS.AUDIT_READ)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Audit trail (filter by user, action, entity, branch, from/to)' })
  @ApiPaginatedResponse(AuditLogResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListAuditLogsQueryDto) {
    return this.audit.list(tenant, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One audit entry' })
  @ApiEnvelopeResponse(AuditLogResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'AUDIT_LOG_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.audit.findOne(tenant, id);
  }
}

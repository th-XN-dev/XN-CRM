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
import { SkipAudit } from '../audit/audit.interceptor';
import { ApiEnvelopeArrayResponse, ApiEnvelopeResponse } from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { ChecklistsService } from './checklists.service';
import {
  ChecklistDayDto,
  ChecklistItemDto,
  ChecklistTemplateDto,
  CreateChecklistDto,
  ListChecklistDayQueryDto,
  ListChecklistTemplatesQueryDto,
  UpdateChecklistDto,
  UpdateChecklistItemDto,
} from './dto/checklist.dto';

const ANY_CHECKLIST = [
  PERMISSIONS.CHECKLISTS_READ_OWN,
  PERMISSIONS.CHECKLISTS_READ,
  PERMISSIONS.CHECKLISTS_MANAGE,
] as const;

@ApiTags('Checklists')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}

  @Get('day')
  @RequireAnyPermission(...ANY_CHECKLIST)
  @ApiOperation({
    summary: "A day's checklist (default today): own items, or the branch's for managers",
  })
  @ApiEnvelopeResponse(ChecklistDayDto)
  day(@CurrentTenant() tenant: TenantContext, @Query() query: ListChecklistDayQueryDto) {
    return this.checklists.day(tenant, query);
  }

  @Patch('items/:id')
  @SkipAudit() // ticks and autosaved comments are the item's own history, not audit noise
  @RequireAnyPermission(...ANY_CHECKLIST)
  @ApiOperation({ summary: 'Tick an item off (done) and/or save its inline comment' })
  @ApiEnvelopeResponse(ChecklistItemDto)
  updateItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.checklists.updateItem(tenant, id, dto);
  }

  @Get()
  @RequireAnyPermission(...ANY_CHECKLIST)
  @ApiOperation({ summary: 'Checklists (templates) the caller may see' })
  @ApiEnvelopeArrayResponse(ChecklistTemplateDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListChecklistTemplatesQueryDto) {
    return this.checklists.listTemplates(tenant, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CHECKLISTS_MANAGE)
  @ApiOperation({ summary: 'Create a daily checklist item for an employee (oneself included)' })
  @ApiEnvelopeResponse(ChecklistTemplateDto, HttpStatus.CREATED)
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateChecklistDto) {
    return this.checklists.create(tenant, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CHECKLISTS_MANAGE)
  @ApiOperation({ summary: 'Edit, reassign or stop (isActive=false) a checklist' })
  @ApiEnvelopeResponse(ChecklistTemplateDto)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChecklistDto,
  ) {
    return this.checklists.update(tenant, id, dto);
  }
}

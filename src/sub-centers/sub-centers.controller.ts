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
  ApiEnvelopeArrayResponse,
  ApiEnvelopeResponse,
  ApiErrorResponse,
} from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  CreateSubCenterDto,
  ListSubCentersQueryDto,
  SubCenterDto,
  SubCenterStatusDto,
  UpdateSubCenterDto,
} from './dto/sub-center.dto';
import { SubCentersService } from './sub-centers.service';

@ApiTags('Sub-centers')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('sub-centers')
export class SubCentersController {
  constructor(private readonly subCenters: SubCentersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUB_CENTERS_READ)
  @ApiOperation({ summary: 'Sub-centers of the current center with their branches' })
  @ApiEnvelopeArrayResponse(SubCenterDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListSubCentersQueryDto) {
    return this.subCenters.list(tenant, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUB_CENTERS_MANAGE)
  @ApiEnvelopeResponse(SubCenterDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'SUB_CENTER_CODE_TAKEN')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateSubCenterDto) {
    return this.subCenters.create(tenant, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUB_CENTERS_READ)
  @ApiEnvelopeResponse(SubCenterDto)
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.subCenters.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUB_CENTERS_MANAGE)
  @ApiEnvelopeResponse(SubCenterDto)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubCenterDto,
  ) {
    return this.subCenters.update(tenant, id, dto);
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.SUB_CENTERS_MANAGE)
  @ApiOperation({ summary: 'Activate, freeze or archive (frozen/archived → branches unusable)' })
  @ApiEnvelopeResponse(SubCenterDto, HttpStatus.CREATED)
  setStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubCenterStatusDto,
  ) {
    return this.subCenters.setStatus(tenant, id, dto);
  }
}

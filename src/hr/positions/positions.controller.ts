import {
  Body,
  Controller,
  Delete,
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
  CreateDirectoryItemDto,
  DirectoryItemResponseDto,
  ListDirectoryQueryDto,
  UpdateDirectoryItemDto,
} from '../common/directory.dto';
import { PositionsService } from './positions.service';

@ApiTags('HR · Positions')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('positions')
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.POSITIONS_MANAGE)
  @ApiOperation({ summary: 'Create a position (code unique per organization)' })
  @ApiEnvelopeResponse(DirectoryItemResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'POSITION_CODE_TAKEN')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateDirectoryItemDto) {
    return this.positions.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.POSITIONS_READ)
  @ApiOperation({ summary: 'List positions (search by name/code, filter by isActive)' })
  @ApiPaginatedResponse(DirectoryItemResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListDirectoryQueryDto) {
    return this.positions.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.POSITIONS_READ)
  @ApiOperation({ summary: 'Get a position' })
  @ApiEnvelopeResponse(DirectoryItemResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'POSITION_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.positions.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.POSITIONS_MANAGE)
  @ApiOperation({ summary: 'Edit or re-activate a position' })
  @ApiEnvelopeResponse(DirectoryItemResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'POSITION_CODE_TAKEN')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDirectoryItemDto,
  ) {
    return this.positions.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.POSITIONS_MANAGE)
  @ApiOperation({ summary: 'Deactivate a position (soft delete)' })
  @ApiEnvelopeResponse(DirectoryItemResponseDto)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.positions.remove(tenant, id);
  }
}

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
import { DepartmentsService } from './departments.service';

@ApiTags('HR · Departments')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_MANAGE)
  @ApiOperation({ summary: 'Create a department (code unique per organization)' })
  @ApiEnvelopeResponse(DirectoryItemResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'DEPARTMENT_CODE_TAKEN')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateDirectoryItemDto) {
    return this.departments.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_READ)
  @ApiOperation({ summary: 'List departments (search by name/code, filter by isActive)' })
  @ApiPaginatedResponse(DirectoryItemResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListDirectoryQueryDto) {
    return this.departments.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_READ)
  @ApiOperation({ summary: 'Get a department' })
  @ApiEnvelopeResponse(DirectoryItemResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'DEPARTMENT_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.departments.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_MANAGE)
  @ApiOperation({ summary: 'Edit or re-activate a department' })
  @ApiEnvelopeResponse(DirectoryItemResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'DEPARTMENT_CODE_TAKEN')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDirectoryItemDto,
  ) {
    return this.departments.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DEPARTMENTS_MANAGE)
  @ApiOperation({ summary: 'Deactivate a department (soft delete)' })
  @ApiEnvelopeResponse(DirectoryItemResponseDto)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.departments.remove(tenant, id);
  }
}

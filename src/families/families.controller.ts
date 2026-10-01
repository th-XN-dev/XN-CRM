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
} from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { CreateFamilyDto } from './dto/create-family.dto';
import { FamilyDetailDto, FamilyListItemDto, FamilyResponseDto } from './dto/family-response.dto';
import { ListFamiliesQueryDto } from './dto/list-families-query.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { FamiliesService } from './families.service';

@ApiTags('Families')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('families')
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.FAMILIES_CREATE)
  @ApiOperation({ summary: 'Create a family (primary branch defaults to X-Branch-Id)' })
  @ApiEnvelopeResponse(FamilyResponseDto, HttpStatus.CREATED)
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateFamilyDto) {
    return this.families.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.FAMILIES_READ)
  @ApiOperation({ summary: 'Search families (name, phone, email)' })
  @ApiPaginatedResponse(FamilyListItemDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListFamiliesQueryDto) {
    return this.families.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.FAMILIES_READ)
  @ApiOperation({ summary: 'Family with its students' })
  @ApiEnvelopeResponse(FamilyDetailDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'FAMILY_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.families.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.FAMILIES_UPDATE)
  @ApiOperation({ summary: 'Update a family' })
  @ApiEnvelopeResponse(FamilyResponseDto)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFamilyDto,
  ) {
    return this.families.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.FAMILIES_DELETE)
  @ApiOperation({ summary: 'Deactivate a family (soft delete)' })
  @ApiEnvelopeResponse(FamilyResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'FAMILY_HAS_ACTIVE_STUDENTS')
  deactivate(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.families.deactivate(tenant, id);
  }
}

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
import { CreateTeacherDto, ListTeachersQueryDto, UpdateTeacherDto } from './dto/teacher.dto';
import { TeacherDetailDto, TeacherResponseDto } from './dto/teacher-response.dto';
import { TeachersService } from './teachers.service';

@ApiTags('Teachers')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.TEACHERS_CREATE)
  @ApiOperation({ summary: 'Create a teacher profile (branch defaults to X-Branch-Id)' })
  @ApiEnvelopeResponse(TeacherResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'TEACHER_USER_TAKEN')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateTeacherDto) {
    return this.teachers.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.TEACHERS_READ)
  @ApiOperation({ summary: 'List teachers (filters: status, branchId, search)' })
  @ApiPaginatedResponse(TeacherResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListTeachersQueryDto) {
    return this.teachers.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TEACHERS_READ)
  @ApiOperation({ summary: 'Teacher with the groups they lead' })
  @ApiEnvelopeResponse(TeacherDetailDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'TEACHER_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.teachers.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TEACHERS_UPDATE)
  @ApiOperation({ summary: 'Update a teacher' })
  @ApiEnvelopeResponse(TeacherResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'TEACHER_HAS_ACTIVE_GROUPS | TEACHER_USER_TAKEN')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.teachers.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.TEACHERS_DELETE)
  @ApiOperation({ summary: 'Deactivate a teacher (soft delete)' })
  @ApiEnvelopeResponse(TeacherResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'TEACHER_HAS_ACTIVE_GROUPS')
  deactivate(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.teachers.deactivate(tenant, id);
  }
}

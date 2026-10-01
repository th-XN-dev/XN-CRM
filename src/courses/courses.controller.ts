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
import { CoursesService } from './courses.service';
import { CreateCourseDto, ListCoursesQueryDto, UpdateCourseDto } from './dto/course.dto';
import { CourseDetailDto, CourseListItemDto, CourseResponseDto } from './dto/course-response.dto';

@ApiTags('Courses')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.COURSES_CREATE)
  @ApiOperation({ summary: 'Create a course (organization-wide)' })
  @ApiEnvelopeResponse(CourseResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'COURSE_CODE_TAKEN')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCourseDto) {
    return this.courses.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  @ApiOperation({ summary: 'List courses' })
  @ApiPaginatedResponse(CourseListItemDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListCoursesQueryDto) {
    return this.courses.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  @ApiOperation({ summary: 'Course with its levels' })
  @ApiEnvelopeResponse(CourseDetailDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COURSES_UPDATE)
  @ApiOperation({ summary: 'Update a course' })
  @ApiEnvelopeResponse(CourseResponseDto)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courses.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.COURSES_DELETE)
  @ApiOperation({ summary: 'Deactivate a course (soft delete)' })
  @ApiEnvelopeResponse(CourseResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'COURSE_HAS_ACTIVE_GROUPS')
  deactivate(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.deactivate(tenant, id);
  }
}

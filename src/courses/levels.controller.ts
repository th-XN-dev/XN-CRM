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
import { LevelResponseDto } from './dto/course-response.dto';
import { CreateLevelDto, ListLevelsQueryDto, UpdateLevelDto } from './dto/level.dto';
import { LevelsService } from './levels.service';

@ApiTags('Levels')
@ApiBearerAuth()
@OrganizationScoped()
@Controller()
export class LevelsController {
  constructor(private readonly levels: LevelsService) {}

  @Post('courses/:courseId/levels')
  @RequirePermissions(PERMISSIONS.COURSES_CREATE)
  @ApiOperation({ summary: 'Add a level to a course' })
  @ApiEnvelopeResponse(LevelResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'LEVEL_CODE_TAKEN | COURSE_INACTIVE')
  create(
    @CurrentTenant() tenant: TenantContext,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateLevelDto,
  ) {
    return this.levels.create(tenant, courseId, dto);
  }

  @Get('courses/:courseId/levels')
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  @ApiOperation({ summary: 'Levels of a course, in order' })
  @ApiPaginatedResponse(LevelResponseDto)
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: ListLevelsQueryDto,
  ) {
    return this.levels.list(tenant, courseId, query);
  }

  @Patch('levels/:id')
  @RequirePermissions(PERMISSIONS.COURSES_UPDATE)
  @ApiOperation({ summary: 'Update a level' })
  @ApiEnvelopeResponse(LevelResponseDto)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLevelDto,
  ) {
    return this.levels.update(tenant, id, dto);
  }

  @Delete('levels/:id')
  @RequirePermissions(PERMISSIONS.COURSES_DELETE)
  @ApiOperation({ summary: 'Deactivate a level (soft delete)' })
  @ApiEnvelopeResponse(LevelResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'LEVEL_HAS_ACTIVE_GROUPS')
  deactivate(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.levels.deactivate(tenant, id);
  }
}

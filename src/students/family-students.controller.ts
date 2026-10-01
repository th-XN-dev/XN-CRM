import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../common/swagger/api-responses';
import { FamiliesService } from '../families/families.service';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { StudentListItemDto } from './dto/student-response.dto';
import { StudentsService } from './students.service';

/** `GET /families/:id/students` lives here to keep Families → Students dependency one-way. */
@ApiTags('Families')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('families')
export class FamilyStudentsController {
  constructor(
    private readonly families: FamiliesService,
    private readonly students: StudentsService,
  ) {}

  @Get(':id/students')
  @RequirePermissions(PERMISSIONS.FAMILIES_READ, PERMISSIONS.STUDENTS_READ)
  @ApiOperation({ summary: 'Students of a family' })
  @ApiPaginatedResponse(StudentListItemDto)
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListStudentsQueryDto,
  ) {
    await this.families.getAccessible(tenant, id);
    return this.students.list(tenant, { ...query, familyId: id });
  }
}

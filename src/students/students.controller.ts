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
import { EnrollmentResponseDto } from '../enrollments/dto/enrollment-response.dto';
import { StudentHistoryQueryDto } from '../enrollments/dto/enrollment.dto';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { CreateStudentDto } from './dto/create-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import {
  StudentDetailDto,
  StudentListItemDto,
  StudentResponseDto,
} from './dto/student-response.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

@ApiTags('Students')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('students')
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  @Post()
  @RequirePermissions(PERMISSIONS.STUDENTS_CREATE)
  @ApiOperation({
    summary: 'Create a student for an existing family (familyId) or a new one (family)',
  })
  @ApiEnvelopeResponse(StudentResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'FAMILY_NOT_FOUND')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateStudentDto) {
    return this.students.create(tenant, dto);
  }

  @Get()
  @RequireAnyPermission(PERMISSIONS.STUDENTS_READ, PERMISSIONS.STUDENTS_READ_OWN)
  @ApiOperation({ summary: 'Search students (name, phone, family phone) with filters' })
  @ApiPaginatedResponse(StudentListItemDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListStudentsQueryDto) {
    return this.students.list(tenant, query);
  }

  @Get(':id')
  @RequireAnyPermission(PERMISSIONS.STUDENTS_READ, PERMISSIONS.STUDENTS_READ_OWN)
  @ApiOperation({ summary: 'Student with family, branch and current enrollment' })
  @ApiEnvelopeResponse(StudentDetailDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'STUDENT_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.STUDENTS_UPDATE)
  @ApiOperation({ summary: 'Update a student, including status changes' })
  @ApiEnvelopeResponse(StudentResponseDto)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'INVALID_STATUS_TRANSITION')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.students.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.STUDENTS_DELETE)
  @ApiOperation({ summary: 'Mark student as LEFT (soft delete; closes the active enrollment)' })
  @ApiEnvelopeResponse(StudentResponseDto)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.remove(tenant, id);
  }

  @Get(':id/enrollments')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ, PERMISSIONS.ENROLLMENTS_READ)
  @ApiOperation({ summary: 'Enrollment history of the student (newest first)' })
  @ApiPaginatedResponse(EnrollmentResponseDto)
  async history(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StudentHistoryQueryDto,
  ) {
    await this.students.getAccessible(tenant, id);
    return this.enrollments.listForStudent(tenant, id, query);
  }
}

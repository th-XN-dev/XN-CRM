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
  ApiEnvelopeArrayResponse,
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
  AddEmployeeBranchDto,
  CreateEmployeeDto,
  EmployeeBranchResponseDto,
  EmployeeResponseDto,
  ListEmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';
import { EmployeeBranchesService } from './employee-branches.service';
import { EmployeesService } from './employees.service';

@ApiTags('HR · Employees')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly employeeBranches: EmployeeBranchesService,
  ) {}

  @Post()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_CREATE)
  @ApiOperation({
    summary: 'Create an employee with their branches (optionally linked to a login)',
  })
  @ApiEnvelopeResponse(EmployeeResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'EMPLOYEE_USER_NOT_MEMBER / BRANCH_CONTEXT_REQUIRED')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'EMPLOYEE_USER_TAKEN / POSITION_INACTIVE / DEPARTMENT_INACTIVE',
  )
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  @ApiOperation({
    summary:
      'Search employees (name, phone, email) and filter by status, position, department, branch',
  })
  @ApiPaginatedResponse(EmployeeResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListEmployeesQueryDto) {
    return this.employees.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  @ApiOperation({ summary: 'Get an employee' })
  @ApiEnvelopeResponse(EmployeeResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'EMPLOYEE_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_UPDATE)
  @ApiOperation({ summary: 'Edit an employee, change status or (un)link a login' })
  @ApiEnvelopeResponse(EmployeeResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'EMPLOYEE_USER_TAKEN')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_DELETE)
  @ApiOperation({ summary: 'Terminate an employee (soft delete; records are kept)' })
  @ApiEnvelopeResponse(EmployeeResponseDto)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.remove(tenant, id);
  }

  // ─── branches ─────────────────────────────────────────────────────────────

  @Get(':id/branches')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  @ApiOperation({ summary: 'Branches the employee works in (primary first)' })
  @ApiEnvelopeArrayResponse(EmployeeBranchResponseDto)
  listBranches(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.employeeBranches.list(tenant, id);
  }

  @Post(':id/branches')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_BRANCHES_MANAGE)
  @ApiOperation({ summary: 'Add a branch to the employee (optionally as the new primary)' })
  @ApiEnvelopeResponse(EmployeeBranchResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'EMPLOYEE_BRANCH_EXISTS')
  addBranch(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddEmployeeBranchDto,
  ) {
    return this.employeeBranches.add(tenant, id, dto);
  }

  @Patch(':id/branches/:branchId/primary')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_BRANCHES_MANAGE)
  @ApiOperation({ summary: "Make one of the employee's branches primary" })
  @ApiEnvelopeResponse(EmployeeBranchResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'EMPLOYEE_BRANCH_NOT_FOUND')
  setPrimaryBranch(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.employeeBranches.setPrimary(tenant, id, branchId);
  }

  @Delete(':id/branches/:branchId')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_BRANCHES_MANAGE)
  @ApiOperation({ summary: 'Remove a (non-primary) branch from the employee' })
  @ApiEnvelopeResponse(EmployeeBranchResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'EMPLOYEE_PRIMARY_BRANCH_REQUIRED')
  removeBranch(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.employeeBranches.remove(tenant, id, branchId);
  }
}

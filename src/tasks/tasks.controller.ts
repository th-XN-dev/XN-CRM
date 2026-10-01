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
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import {
  AssignTaskDto,
  ChangeTaskStatusDto,
  CreateTaskCommentDto,
  CreateTaskBatchDto,
  CreateTaskDto,
  EmployeeTaskStatisticsDto,
  ListTaskHistoryQueryDto,
  ListTasksQueryDto,
  TaskActivityResponseDto,
  TaskCommentResponseDto,
  TaskBatchResultDto,
  TaskResponseDto,
  TaskStatisticsDto,
  TaskStatisticsQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TaskCommentsService } from './task-comments.service';
import { TaskHistoryService } from './task-history.service';
import { TaskStatsService } from './task-stats.service';
import { TasksService } from './tasks.service';

const READ = [PERMISSIONS.TASKS_READ, PERMISSIONS.TASKS_READ_OWN] as const;

@ApiTags('Tasks')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly comments: TaskCommentsService,
    private readonly history: TaskHistoryService,
    private readonly stats: TaskStatsService,
  ) {}

  @Post()
  @RequirePermissions(PERMISSIONS.TASKS_CREATE)
  @ApiOperation({
    summary: 'Create a task (assigning on create also requires tasks.assign)',
  })
  @ApiEnvelopeResponse(TaskResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'TASK_RELATED_NOT_FOUND / EMPLOYEE_NOT_FOUND')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'EMPLOYEE_NOT_ASSIGNABLE / TASK_ASSIGNEE_NO_BRANCH_ACCESS')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateTaskDto) {
    return this.tasks.create(tenant, dto);
  }

  @Post('batch')
  @RequirePermissions(PERMISSIONS.TASKS_CREATE, PERMISSIONS.TASKS_ASSIGN)
  @ApiOperation({ summary: 'Give the same task to several employees or to everyone in the branch' })
  @ApiEnvelopeResponse(TaskBatchResultDto, HttpStatus.CREATED)
  createBatch(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateTaskBatchDto) {
    return this.tasks.createBatch(tenant, dto);
  }

  @Get()
  @RequireAnyPermission(...READ)
  @ApiOperation({
    summary: 'List tasks (tasks.read: branch tasks; tasks.read_own: own tasks only)',
  })
  @ApiPaginatedResponse(TaskResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListTasksQueryDto) {
    return this.tasks.list(tenant, query);
  }

  @Get('overdue')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Overdue tasks: past due and not completed/cancelled' })
  @ApiPaginatedResponse(TaskResponseDto)
  overdue(@CurrentTenant() tenant: TenantContext, @Query() query: ListTasksQueryDto) {
    return this.tasks.listOverdue(tenant, query);
  }

  @Get('statistics')
  @RequirePermissions(PERMISSIONS.TASKS_STATISTICS_READ)
  @ApiOperation({ summary: 'Task counts by status and overdue (organization/branch)' })
  @ApiEnvelopeResponse(TaskStatisticsDto)
  statistics(@CurrentTenant() tenant: TenantContext, @Query() query: TaskStatisticsQueryDto) {
    return this.stats.statistics(tenant, query);
  }

  @Get('statistics/employees/:employeeId')
  @RequirePermissions(PERMISSIONS.TASKS_STATISTICS_READ)
  @ApiOperation({
    summary: "An employee's task counts and completion rate (factual, not a rating)",
  })
  @ApiEnvelopeResponse(EmployeeTaskStatisticsDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'EMPLOYEE_NOT_FOUND')
  employeeStatistics(
    @CurrentTenant() tenant: TenantContext,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.stats.employeeStatistics(tenant, employeeId);
  }

  @Get(':id')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Get a task' })
  @ApiEnvelopeResponse(TaskResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'TASK_NOT_FOUND')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'TASK_ACCESS_DENIED / BRANCH_ACCESS_DENIED')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TASKS_UPDATE)
  @ApiOperation({ summary: 'Edit title, description, priority, deadline or related resource' })
  @ApiEnvelopeResponse(TaskResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'TASK_CLOSED')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.TASKS_DELETE)
  @ApiOperation({ summary: 'Delete a task (soft delete; history is kept)' })
  @ApiEnvelopeResponse(TaskResponseDto)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.remove(tenant, id);
  }

  @Patch(':id/status')
  @RequireAnyPermission(PERMISSIONS.TASKS_UPDATE, PERMISSIONS.TASKS_UPDATE_OWN)
  @ApiOperation({
    summary: 'Change status (assignees with tasks.update_own cannot cancel or reopen)',
  })
  @ApiEnvelopeResponse(TaskResponseDto)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'INVALID_STATUS_TRANSITION')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'TASK_ACCESS_DENIED')
  changeStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTaskStatusDto,
  ) {
    return this.tasks.changeStatus(tenant, id, dto);
  }

  @Patch(':id/assign')
  @RequirePermissions(PERMISSIONS.TASKS_ASSIGN)
  @ApiOperation({ summary: "Assign to an employee of the task's branch, or unassign (null)" })
  @ApiEnvelopeResponse(TaskResponseDto)
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'TASK_CLOSED / EMPLOYEE_NOT_ASSIGNABLE / TASK_ASSIGNEE_NO_BRANCH_ACCESS',
  )
  assign(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTaskDto,
  ) {
    return this.tasks.assign(tenant, id, dto);
  }

  @Post(':id/comments')
  @RequirePermissions(PERMISSIONS.TASKS_COMMENT)
  @ApiOperation({ summary: 'Comment on a visible task (author = caller)' })
  @ApiEnvelopeResponse(TaskCommentResponseDto, HttpStatus.CREATED)
  addComment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskCommentDto,
  ) {
    return this.comments.add(tenant, id, dto);
  }

  @Get(':id/comments')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Task comments (oldest first)' })
  @ApiPaginatedResponse(TaskCommentResponseDto)
  listComments(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTaskHistoryQueryDto,
  ) {
    return this.comments.list(tenant, id, query);
  }

  @Get(':id/history')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Task history (append-only, newest first)' })
  @ApiPaginatedResponse(TaskActivityResponseDto)
  listHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTaskHistoryQueryDto,
  ) {
    return this.history.list(tenant, id, query);
  }
}

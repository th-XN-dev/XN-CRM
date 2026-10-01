import { ApiProperty, OmitType } from '@nestjs/swagger';
import { TaskActivityType, TaskPriority, TaskRelatedType, TaskStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto, PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { toBoolean, trimString } from '../../common/utils/transforms';
import { IsDateOnly } from '../../common/validation/decorators';

export class CreateTaskDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ enum: TaskPriority, required: false, default: TaskPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  /** Deadline (ISO 8601 date-time). */
  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string;

  /** Employee to assign (requires `tasks.assign`); must work in the task's branch. */
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  /** Linked CRM resource; `relatedType` and `relatedId` go together. */
  @ApiProperty({ enum: TaskRelatedType, required: false })
  @ValidateIf((dto: CreateTaskDto) => dto.relatedId !== undefined)
  @IsEnum(TaskRelatedType)
  relatedType?: TaskRelatedType;

  @ValidateIf((dto: CreateTaskDto) => dto.relatedType !== undefined)
  @IsUUID()
  relatedId?: string;

  /** Defaults to the selected `X-Branch-Id`. */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/**
 * Status and assignee have their own endpoints. `null` clears `description`,
 * `dueDate` or the related resource (send both `relatedType` and `relatedId` as null).
 */
export class UpdateTaskDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiProperty({ enum: TaskPriority, required: false })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, required: false })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true })
  dueDate?: string | null;

  @ApiProperty({ enum: TaskRelatedType, nullable: true, required: false })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(TaskRelatedType)
  relatedType?: TaskRelatedType | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  relatedId?: string | null;
}

export class ChangeTaskStatusDto {
  @ApiProperty({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  status!: TaskStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AssignTaskDto {
  /** Employee id, or `null` to unassign. */
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assignedToId!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ListTasksQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Assignee employee id. */
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  /** Creator user id. */
  @IsOptional()
  @IsUUID()
  createdById?: string;

  /** `true` → only tasks assigned to the caller's own employee profile. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;

  @ApiProperty({ enum: TaskStatus, required: false })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiProperty({ enum: TaskPriority, required: false })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  /** Due on or after this instant (ISO 8601). */
  @IsOptional()
  @IsISO8601({ strict: true })
  dueFrom?: string;

  /** Due on or before this instant (ISO 8601). */
  @IsOptional()
  @IsISO8601({ strict: true })
  dueTo?: string;

  /** `true` → past due and not completed/cancelled. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  @ApiProperty({ enum: TaskRelatedType, required: false })
  @IsOptional()
  @IsEnum(TaskRelatedType)
  relatedType?: TaskRelatedType;

  @IsOptional()
  @IsUUID()
  relatedId?: string;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'dueDate', 'priority', 'status', 'title'])
  sortBy: 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'status' | 'title' = 'createdAt';
}

export class TaskStatisticsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Assignee employee id. */
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  /** Tasks created on or after this day (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  from?: string;

  /** Tasks created on or before this day (YYYY-MM-DD). */
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

export class CreateTaskCommentDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}

export class ListTaskHistoryQueryDto extends PaginationQueryDto {}

// ─── responses ──────────────────────────────────────────────────────────────

class RefDto {
  id!: string;
  name!: string;
}

class EmployeeRefDto {
  id!: string;
  firstName!: string;
  lastName!: string;
  userId!: string | null;
}

export class TaskResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  title!: string;
  description!: string | null;
  createdById!: string;
  assignedToId!: string | null;
  @ApiProperty({ enum: TaskPriority })
  priority!: TaskPriority;
  @ApiProperty({ enum: TaskStatus })
  status!: TaskStatus;
  dueDate!: Date | null;
  completedAt!: Date | null;
  @ApiProperty({ enum: TaskRelatedType, nullable: true })
  relatedType!: TaskRelatedType | null;
  relatedId!: string | null;
  /** Shared by the copies of a task given to several employees at once. */
  batchId!: string | null;
  /** Derived: past due and not completed/cancelled. */
  isOverdue!: boolean;
  createdBy!: RefDto;
  assignedTo!: EmployeeRefDto | null;
  branch!: RefDto;
  createdAt!: Date;
  updatedAt!: Date;
}

export class TaskActivityResponseDto {
  id!: string;
  taskId!: string;
  userId!: string;
  @ApiProperty({ enum: TaskActivityType })
  type!: TaskActivityType;
  oldValue!: string | null;
  newValue!: string | null;
  note!: string | null;
  createdAt!: Date;
  user!: RefDto;
}

export class TaskCommentResponseDto {
  id!: string;
  taskId!: string;
  userId!: string;
  content!: string;
  createdAt!: Date;
  updatedAt!: Date;
  /** Comment author. */
  user!: RefDto;
}

export class TaskStatisticsDto {
  total!: number;
  todo!: number;
  inProgress!: number;
  blocked!: number;
  completed!: number;
  cancelled!: number;
  overdue!: number;
}

export class EmployeeTaskStatisticsDto extends TaskStatisticsDto {
  employeeId!: string;
  /** completed / (completed + cancelled) × 100; 0 when none are closed. Not a performance rating. */
  completionRate!: number;
}

/**
 * One task for several employees (or everyone in the branch): each gets an
 * own copy (own status, comments, completion), linked by `batchId`.
 */
export class CreateTaskBatchDto extends OmitType(CreateTaskDto, ['assignedToId'] as const) {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  assigneeIds?: string[];

  /** Every active employee of the task's branch. */
  @IsOptional()
  @IsBoolean()
  allEmployees?: boolean;
}

export class TaskBatchResultDto {
  batchId!: string;
  count!: number;
  tasks!: TaskResponseDto[];
}

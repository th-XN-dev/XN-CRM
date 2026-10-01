-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskRelatedType" AS ENUM ('LEAD', 'STUDENT', 'FAMILY', 'GROUP', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "TaskActivityType" AS ENUM ('CREATED', 'UPDATED', 'ASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'DEADLINE_CHANGED', 'COMMENTED', 'COMPLETED', 'CANCELLED', 'DELETED');

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "primary_branch_id" UUID NOT NULL,
    "user_id" UUID,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(254),
    "birth_date" DATE,
    "hire_date" DATE NOT NULL,
    "termination_date" DATE,
    "position_id" UUID,
    "department_id" UUID,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_branches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(5000),
    "created_by_id" UUID NOT NULL,
    "assigned_to_id" UUID,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "due_date" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "related_type" "TaskRelatedType",
    "related_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "TaskActivityType" NOT NULL,
    "old_value" VARCHAR(500),
    "new_value" VARCHAR(500),
    "note" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" VARCHAR(5000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "positions_organization_id_is_active_idx" ON "positions"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "positions_organization_id_code_key" ON "positions"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "positions_id_organization_id_key" ON "positions"("id", "organization_id");

-- CreateIndex
CREATE INDEX "departments_organization_id_is_active_idx" ON "departments"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_code_key" ON "departments"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_id_organization_id_key" ON "departments"("id", "organization_id");

-- CreateIndex
CREATE INDEX "employees_organization_id_status_idx" ON "employees"("organization_id", "status");

-- CreateIndex
CREATE INDEX "employees_organization_id_primary_branch_id_idx" ON "employees"("organization_id", "primary_branch_id");

-- CreateIndex
CREATE INDEX "employees_organization_id_position_id_idx" ON "employees"("organization_id", "position_id");

-- CreateIndex
CREATE INDEX "employees_organization_id_department_id_idx" ON "employees"("organization_id", "department_id");

-- CreateIndex
CREATE INDEX "employees_organization_id_phone_idx" ON "employees"("organization_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_user_id_key" ON "employees"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_id_organization_id_key" ON "employees"("id", "organization_id");

-- CreateIndex
CREATE INDEX "employee_branches_organization_id_branch_id_idx" ON "employee_branches"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_branches_employee_id_branch_id_key" ON "employee_branches"("employee_id", "branch_id");

-- CreateIndex
CREATE INDEX "tasks_organization_id_branch_id_status_idx" ON "tasks"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "tasks_organization_id_assigned_to_id_status_idx" ON "tasks"("organization_id", "assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "tasks_organization_id_status_due_date_idx" ON "tasks"("organization_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "tasks_organization_id_priority_idx" ON "tasks"("organization_id", "priority");

-- CreateIndex
CREATE INDEX "tasks_organization_id_created_at_idx" ON "tasks"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "tasks_organization_id_related_type_related_id_idx" ON "tasks"("organization_id", "related_type", "related_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_organization_id_key" ON "tasks"("id", "organization_id");

-- CreateIndex
CREATE INDEX "task_activities_task_id_created_at_idx" ON "task_activities"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "task_activities_user_id_idx" ON "task_activities"("user_id");

-- CreateIndex
CREATE INDEX "task_comments_task_id_created_at_idx" ON "task_comments"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "task_comments_user_id_idx" ON "task_comments"("user_id");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_primary_branch_id_organization_id_fkey" FOREIGN KEY ("primary_branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_organization_id_fkey" FOREIGN KEY ("position_id", "organization_id") REFERENCES "positions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_organization_id_fkey" FOREIGN KEY ("department_id", "organization_id") REFERENCES "departments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_branches" ADD CONSTRAINT "employee_branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_branches" ADD CONSTRAINT "employee_branches_employee_id_organization_id_fkey" FOREIGN KEY ("employee_id", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_branches" ADD CONSTRAINT "employee_branches_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_organization_id_fkey" FOREIGN KEY ("assigned_to_id", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_task_id_organization_id_fkey" FOREIGN KEY ("task_id", "organization_id") REFERENCES "tasks"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_organization_id_fkey" FOREIGN KEY ("task_id", "organization_id") REFERENCES "tasks"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Hand-written invariants ────────────────────────────────────────────────

-- Exactly one primary branch per employee.
CREATE UNIQUE INDEX "employee_branches_one_primary"
  ON "employee_branches" ("employee_id") WHERE "is_primary";

ALTER TABLE "employees" ADD CONSTRAINT "employees_termination_after_hire" CHECK (
  "termination_date" IS NULL OR "termination_date" >= "hire_date"
);

-- A related resource is fully specified or absent.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_related_pair" CHECK (
  ("related_type" IS NULL) = ("related_id" IS NULL)
);

-- completed_at is set exactly for COMPLETED tasks.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_at_matches_status" CHECK (
  ("status" = 'COMPLETED') = ("completed_at" IS NOT NULL)
);

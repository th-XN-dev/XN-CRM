-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'FROZEN', 'GRADUATED', 'LEFT');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TRANSFERRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "families" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "primary_branch_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "secondary_phone" VARCHAR(20),
    "email" VARCHAR(254),
    "address" VARCHAR(500),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "middle_name" VARCHAR(80),
    "birth_date" DATE,
    "gender" "Gender",
    "phone" VARCHAR(20),
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" DATE NOT NULL DEFAULT CURRENT_DATE,
    "left_at" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "description" TEXT,
    "monthly_price" DECIMAL(14,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "level_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "monthly_price" DECIMAL(14,2) NOT NULL,
    "status" "GroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "teacher_id" UUID,
    "room_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "started_at" DATE NOT NULL,
    "ended_at" DATE,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "transferred_from_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "families_organization_id_is_active_idx" ON "families"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "families_organization_id_phone_idx" ON "families"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "families_organization_id_primary_branch_id_idx" ON "families"("organization_id", "primary_branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "families_id_organization_id_key" ON "families"("id", "organization_id");

-- CreateIndex
CREATE INDEX "students_organization_id_status_idx" ON "students"("organization_id", "status");

-- CreateIndex
CREATE INDEX "students_organization_id_branch_id_status_idx" ON "students"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "students_organization_id_last_name_first_name_idx" ON "students"("organization_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "students_family_id_idx" ON "students"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_id_organization_id_key" ON "students"("id", "organization_id");

-- CreateIndex
CREATE INDEX "courses_organization_id_is_active_idx" ON "courses"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "courses_organization_id_code_key" ON "courses"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "courses_id_organization_id_key" ON "courses"("id", "organization_id");

-- CreateIndex
CREATE INDEX "levels_course_id_order_idx" ON "levels"("course_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "levels_course_id_code_key" ON "levels"("course_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "levels_id_course_id_key" ON "levels"("id", "course_id");

-- CreateIndex
CREATE INDEX "groups_organization_id_branch_id_status_idx" ON "groups"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "groups_organization_id_course_id_idx" ON "groups"("organization_id", "course_id");

-- CreateIndex
CREATE INDEX "groups_level_id_idx" ON "groups"("level_id");

-- CreateIndex
CREATE INDEX "groups_teacher_id_idx" ON "groups"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_id_organization_id_key" ON "groups"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_id_organization_id_branch_id_key" ON "groups"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_transferred_from_id_key" ON "enrollments"("transferred_from_id");

-- CreateIndex
CREATE INDEX "enrollments_organization_id_branch_id_status_idx" ON "enrollments"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_organization_id_status_idx" ON "enrollments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_student_id_status_idx" ON "enrollments"("student_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_group_id_status_idx" ON "enrollments"("group_id", "status");

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_primary_branch_id_organization_id_fkey" FOREIGN KEY ("primary_branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_family_id_organization_id_fkey" FOREIGN KEY ("family_id", "organization_id") REFERENCES "families"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_course_id_organization_id_fkey" FOREIGN KEY ("course_id", "organization_id") REFERENCES "courses"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_level_id_course_id_fkey" FOREIGN KEY ("level_id", "course_id") REFERENCES "levels"("id", "course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_group_id_organization_id_branch_id_fkey" FOREIGN KEY ("group_id", "organization_id", "branch_id") REFERENCES "groups"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_transferred_from_id_fkey" FOREIGN KEY ("transferred_from_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Hand-written (Prisma cannot express these in schema.prisma) ─────────────

-- A student can have at most one ACTIVE enrollment. Backstops the row-lock check
-- in EnrollmentsService against races.
CREATE UNIQUE INDEX "enrollments_one_active_per_student"
  ON "enrollments" ("student_id") WHERE "status" = 'ACTIVE';

ALTER TABLE "groups" ADD CONSTRAINT "groups_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "groups" ADD CONSTRAINT "groups_dates_ordered" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "courses" ADD CONSTRAINT "courses_monthly_price_non_negative" CHECK ("monthly_price" >= 0);
ALTER TABLE "groups" ADD CONSTRAINT "groups_monthly_price_non_negative" CHECK ("monthly_price" >= 0);
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_dates_ordered" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");

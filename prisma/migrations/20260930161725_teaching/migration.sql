-- CreateEnum
CREATE TYPE "TeacherStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "user_id" UUID,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20),
    "status" "TeacherStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "room_id" UUID,
    "day_of_week" "DayOfWeek" NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "check_in_at" TIMESTAMPTZ(3),
    "note" VARCHAR(1000),
    "marked_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teachers_organization_id_branch_id_status_idx" ON "teachers"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "teachers_organization_id_last_name_first_name_idx" ON "teachers"("organization_id", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_id_organization_id_key" ON "teachers"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_organization_id_user_id_key" ON "teachers"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "rooms_organization_id_branch_id_is_active_idx" ON "rooms"("organization_id", "branch_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_branch_id_code_key" ON "rooms"("branch_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_id_organization_id_branch_id_key" ON "rooms"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "schedules_organization_id_branch_id_day_of_week_idx" ON "schedules"("organization_id", "branch_id", "day_of_week");

-- CreateIndex
CREATE INDEX "schedules_group_id_is_active_idx" ON "schedules"("group_id", "is_active");

-- CreateIndex
CREATE INDEX "schedules_room_id_day_of_week_is_active_idx" ON "schedules"("room_id", "day_of_week", "is_active");

-- CreateIndex
CREATE INDEX "attendance_organization_id_group_id_date_idx" ON "attendance"("organization_id", "group_id", "date");

-- CreateIndex
CREATE INDEX "attendance_organization_id_branch_id_date_idx" ON "attendance"("organization_id", "branch_id", "date");

-- CreateIndex
CREATE INDEX "attendance_group_id_status_idx" ON "attendance"("group_id", "status");

-- CreateIndex
CREATE INDEX "attendance_enrollment_id_status_idx" ON "attendance"("enrollment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_organization_id_enrollment_id_date_key" ON "attendance"("organization_id", "enrollment_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_id_group_id_organization_id_branch_id_key" ON "enrollments"("id", "group_id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "groups_room_id_idx" ON "groups"("room_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_room_id_organization_id_branch_id_fkey" FOREIGN KEY ("room_id", "organization_id", "branch_id") REFERENCES "rooms"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_group_id_organization_id_branch_id_fkey" FOREIGN KEY ("group_id", "organization_id", "branch_id") REFERENCES "groups"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_room_id_organization_id_branch_id_fkey" FOREIGN KEY ("room_id", "organization_id", "branch_id") REFERENCES "rooms"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_enrollment_id_group_id_organization_id_branch_i_fkey" FOREIGN KEY ("enrollment_id", "group_id", "organization_id", "branch_id") REFERENCES "enrollments"("id", "group_id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_group_id_organization_id_branch_id_fkey" FOREIGN KEY ("group_id", "organization_id", "branch_id") REFERENCES "groups"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written (Prisma cannot express these in schema.prisma)
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_time_ordered" CHECK ("end_time" > "start_time");

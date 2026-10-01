-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'NEGOTIATION', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('CALL', 'MESSAGE', 'MEETING', 'TRIAL', 'NOTE', 'STATUS_CHANGED', 'ASSIGNED', 'FOLLOW_UP');

-- CreateTable
CREATE TABLE "lead_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_pipelines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_stages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "phone_normalized" VARCHAR(20) NOT NULL,
    "secondary_phone" VARCHAR(20),
    "source_id" UUID,
    "stage_id" UUID,
    "assigned_to_id" UUID,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "next_follow_up_at" TIMESTAMPTZ(3),
    "converted_at" TIMESTAMPTZ(3),
    "converted_family_id" UUID,
    "converted_student_id" UUID,
    "lost_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "user_id" UUID,
    "type" "LeadActivityType" NOT NULL,
    "note" VARCHAR(2000),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_sources_organization_id_is_active_idx" ON "lead_sources"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_organization_id_code_key" ON "lead_sources"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_id_organization_id_key" ON "lead_sources"("id", "organization_id");

-- CreateIndex
CREATE INDEX "lead_pipelines_organization_id_is_active_idx" ON "lead_pipelines"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "lead_pipelines_id_organization_id_key" ON "lead_pipelines"("id", "organization_id");

-- CreateIndex
CREATE INDEX "lead_stages_pipeline_id_order_idx" ON "lead_stages"("pipeline_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "lead_stages_pipeline_id_code_key" ON "lead_stages"("pipeline_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "lead_stages_id_organization_id_key" ON "lead_stages"("id", "organization_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_branch_id_status_idx" ON "leads"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "leads_organization_id_status_idx" ON "leads"("organization_id", "status");

-- CreateIndex
CREATE INDEX "leads_organization_id_assigned_to_id_status_idx" ON "leads"("organization_id", "assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "leads_organization_id_phone_normalized_idx" ON "leads"("organization_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "leads_organization_id_source_id_idx" ON "leads"("organization_id", "source_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_next_follow_up_at_idx" ON "leads"("organization_id", "next_follow_up_at");

-- CreateIndex
CREATE INDEX "leads_stage_id_idx" ON "leads"("stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_id_organization_id_key" ON "leads"("id", "organization_id");

-- CreateIndex
CREATE INDEX "lead_activities_lead_id_created_at_idx" ON "lead_activities"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_activities_organization_id_branch_id_type_idx" ON "lead_activities"("organization_id", "branch_id", "type");

-- CreateIndex
-- Backstop for duplicate detection: at most one live (not converted, not lost,
-- not deleted) lead per organization per normalized phone. The service checks
-- first and returns DUPLICATE_LEAD; this guarantees it under concurrency.
CREATE UNIQUE INDEX "leads_one_active_per_phone"
  ON "leads" ("organization_id", "phone_normalized")
  WHERE "status" NOT IN ('CONVERTED', 'LOST') AND "deleted_at" IS NULL;

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_pipelines" ADD CONSTRAINT "lead_pipelines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stages" ADD CONSTRAINT "lead_stages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stages" ADD CONSTRAINT "lead_stages_pipeline_id_organization_id_fkey" FOREIGN KEY ("pipeline_id", "organization_id") REFERENCES "lead_pipelines"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_id_organization_id_fkey" FOREIGN KEY ("source_id", "organization_id") REFERENCES "lead_sources"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_organization_id_fkey" FOREIGN KEY ("stage_id", "organization_id") REFERENCES "lead_stages"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_organization_id_fkey" FOREIGN KEY ("lead_id", "organization_id") REFERENCES "leads"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

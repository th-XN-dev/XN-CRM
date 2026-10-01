-- Daily checklists, personal dashboards, task batches (one task → several
-- employees), extra per-member permissions, and two communication types
-- (announcements, congratulations). Additive only: no existing data changes.


ALTER TYPE "NotificationType" ADD VALUE 'ANNOUNCEMENT';
ALTER TYPE "NotificationType" ADD VALUE 'CONGRATULATION';

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "granted_permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "batch_id" UUID;

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "note" VARCHAR(1000),
    "due_time" VARCHAR(5) NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,
    "comment" VARCHAR(2000),
    "comment_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_layouts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "widgets" JSONB NOT NULL DEFAULT '[]',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_templates_organization_id_is_active_idx" ON "checklist_templates"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_id_organization_id_key" ON "checklist_templates"("id", "organization_id");

-- CreateIndex
CREATE INDEX "checklist_items_organization_id_date_idx" ON "checklist_items"("organization_id", "date");

-- CreateIndex
CREATE INDEX "checklist_items_organization_id_assignee_id_date_idx" ON "checklist_items"("organization_id", "assignee_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_items_template_id_date_key" ON "checklist_items"("template_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_layouts_organization_id_user_id_key" ON "dashboard_layouts"("organization_id", "user_id");

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_assignee_id_organization_id_fkey" FOREIGN KEY ("assignee_id", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_template_id_organization_id_fkey" FOREIGN KEY ("template_id", "organization_id") REFERENCES "checklist_templates"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_assignee_id_organization_id_fkey" FOREIGN KEY ("assignee_id", "organization_id") REFERENCES "employees"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- "HH:MM" only; weekdays are ISO 1..7.
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_due_time_format" CHECK ("due_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_weekdays_range" CHECK ("weekdays" <@ ARRAY[1,2,3,4,5,6,7] AND cardinality("weekdays") > 0);

CREATE INDEX "tasks_organization_id_batch_id_idx" ON "tasks"("organization_id", "batch_id");

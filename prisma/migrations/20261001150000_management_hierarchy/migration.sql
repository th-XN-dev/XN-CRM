-- Management hierarchy: platform OWNER → Center (= organization) → Sub-Center → Branch.
-- Existing data is kept: every organization becomes a center with a status derived
-- from its old flags, existing branches stay directly under their center, and the
-- organization-level OWNER role becomes DIRECTOR (same permissions, same members).

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('OWNER');

-- CreateEnum
CREATE TYPE "CenterStatus" AS ENUM ('ACTIVE', 'FROZEN', 'ARCHIVED');

-- Users: platform role and temporary-password handling.
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "platform_role" "PlatformRole";

-- Organizations → centers: lifecycle status and activation period.
ALTER TABLE "organizations" ADD COLUMN     "active_from" DATE,
ADD COLUMN     "active_until" DATE,
ADD COLUMN     "status" "CenterStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "status_changed_at" TIMESTAMPTZ(3);

-- Data: soft-deleted → ARCHIVED, deactivated → FROZEN, everything else stays ACTIVE.
UPDATE "organizations"
SET "status" = CASE
      WHEN "deleted_at" IS NOT NULL THEN 'ARCHIVED'::"CenterStatus"
      WHEN "is_active" = false THEN 'FROZEN'::"CenterStatus"
      ELSE 'ACTIVE'::"CenterStatus"
    END,
    "status_changed_at" = CASE
      WHEN "deleted_at" IS NOT NULL OR "is_active" = false THEN "updated_at"
      ELSE NULL
    END;

ALTER TABLE "organizations" DROP COLUMN "is_active";

-- An activation period never ends before it starts.
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_active_period"
  CHECK ("active_from" IS NULL OR "active_until" IS NULL OR "active_from" <= "active_until");

-- CreateTable
CREATE TABLE "sub_centers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "logo_url" VARCHAR(2048),
    "primary_color" CHAR(7),
    "phone" VARCHAR(20),
    "address" VARCHAR(500),
    "status" "CenterStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sub_centers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sub_centers" ADD CONSTRAINT "sub_centers_primary_color_hex"
  CHECK ("primary_color" IS NULL OR "primary_color" ~ '^#[0-9A-Fa-f]{6}$');

-- CreateIndex
CREATE INDEX "sub_centers_organization_id_status_idx" ON "sub_centers"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sub_centers_organization_id_code_key" ON "sub_centers"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sub_centers_organization_id_slug_key" ON "sub_centers"("organization_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "sub_centers_id_organization_id_key" ON "sub_centers"("id", "organization_id");

-- Branches: optional parent sub-center (existing branches stay directly under the center).
ALTER TABLE "branches" ADD COLUMN     "sub_center_id" UUID;

-- CreateIndex
CREATE INDEX "branches_sub_center_id_idx" ON "branches"("sub_center_id");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- AddForeignKey
ALTER TABLE "sub_centers" ADD CONSTRAINT "sub_centers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: the composite key keeps a branch and its sub-center in the same center.
ALTER TABLE "branches" ADD CONSTRAINT "branches_sub_center_id_organization_id_fkey" FOREIGN KEY ("sub_center_id", "organization_id") REFERENCES "sub_centers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RBAC: the organization-level OWNER role is the center DIRECTOR from now on.
-- Same row (id), so memberships and granted permissions are untouched.
UPDATE "roles"
SET "key" = 'DIRECTOR',
    "name" = 'Director',
    "description" = 'Runs the center: settings, sub-centers, branches, staff and analytics.',
    "updated_at" = now()
WHERE "key" = 'OWNER' AND "organization_id" IS NULL;

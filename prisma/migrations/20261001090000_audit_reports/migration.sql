-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "branch_id" UUID,
    "user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64),
    "entity_id" VARCHAR(64),
    "old_data" JSONB,
    "new_data" JSONB,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "request_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_user_id_created_at_idx" ON "audit_logs"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_action_created_at_idx" ON "audit_logs"("organization_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_branch_id_created_at_idx" ON "audit_logs"("organization_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "leads_organization_id_created_at_idx" ON "leads"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "students_organization_id_joined_at_idx" ON "students"("organization_id", "joined_at");

-- CreateIndex
CREATE INDEX "students_organization_id_left_at_idx" ON "students"("organization_id", "left_at");


-- ─── Hand-written invariants ────────────────────────────────────────────────

-- Audit history is append-only: any UPDATE or DELETE is rejected by the database.
-- (TRUNCATE is statement-level and reserved for test databases / operators.)
CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% is not allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();

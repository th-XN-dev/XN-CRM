-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_DUE', 'TASK_OVERDUE', 'PAYMENT_RECEIVED', 'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'ATTENDANCE_ABSENT', 'ATTENDANCE_LATE', 'LEAD_ASSIGNED', 'LEAD_FOLLOW_UP', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'TELEGRAM', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "recipient_user_id" UUID NOT NULL,
    "related_type" VARCHAR(32),
    "related_id" UUID,
    "event_key" VARCHAR(200) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(50),
    "provider_message_id" VARCHAR(200),
    "sent_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "error_message" VARCHAR(1000),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL,
    "telegram_enabled" BOOLEAN NOT NULL,
    "email_enabled" BOOLEAN NOT NULL,
    "sms_enabled" BOOLEAN NOT NULL,
    "push_enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title_template" VARCHAR(200) NOT NULL,
    "message_template" VARCHAR(2000) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL,
    "recipient_permission" VARCHAR(100),
    "default_channels" "NotificationChannel"[],
    "locked_channels" "NotificationChannel"[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_telegram_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "telegram_user_id" VARCHAR(32) NOT NULL,
    "username" VARCHAR(64),
    "chat_id" VARCHAR(32) NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_telegram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_link_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_organization_id_recipient_user_id_is_read_cre_idx" ON "notifications"("organization_id", "recipient_user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_organization_id_recipient_user_id_created_at_idx" ON "notifications"("organization_id", "recipient_user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_organization_id_branch_id_idx" ON "notifications"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "notifications_organization_id_type_idx" ON "notifications"("organization_id", "type");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_organization_id_recipient_user_id_event_key_key" ON "notifications"("organization_id", "recipient_user_id", "event_key");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_id_organization_id_key" ON "notifications"("id", "organization_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_organization_id_channel_status_idx" ON "notification_deliveries"("organization_id", "channel", "status");

-- CreateIndex
CREATE INDEX "notification_deliveries_organization_id_status_created_at_idx" ON "notification_deliveries"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_created_at_idx" ON "notification_deliveries"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key" ON "notification_deliveries"("notification_id", "channel");

-- CreateIndex
CREATE INDEX "notification_preferences_organization_id_idx" ON "notification_preferences"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_organization_id_type_key" ON "notification_preferences"("user_id", "organization_id", "type");

-- CreateIndex
CREATE INDEX "notification_templates_organization_id_type_idx" ON "notification_templates"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_organization_id_type_channel_key" ON "notification_templates"("organization_id", "type", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notification_policies_organization_id_type_key" ON "notification_policies"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "user_telegram_accounts_user_id_key" ON "user_telegram_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_telegram_accounts_telegram_user_id_key" ON "user_telegram_accounts"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_tokens_code_hash_key" ON "telegram_link_tokens"("code_hash");

-- CreateIndex
CREATE INDEX "telegram_link_tokens_user_id_idx" ON "telegram_link_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_organization_id_fkey" FOREIGN KEY ("notification_id", "organization_id") REFERENCES "notifications"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_policies" ADD CONSTRAINT "notification_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_telegram_accounts" ADD CONSTRAINT "user_telegram_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Hand-written invariants ────────────────────────────────────────────────

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_pair" CHECK (
  ("related_type" IS NULL) = ("related_id" IS NULL)
);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_read_at_matches" CHECK (
  "is_read" = ("read_at" IS NOT NULL)
);
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_attempts_non_negative" CHECK ("attempts" >= 0);

-- Fast unread badge: only live, unread in-app rows.
CREATE INDEX "notifications_unread_badge"
  ON "notifications" ("organization_id", "recipient_user_id")
  WHERE "is_read" = false AND "deleted_at" IS NULL AND "in_app" = true;

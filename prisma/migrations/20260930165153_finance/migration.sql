-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'SALARY', 'UTILITY', 'MARKETING', 'EQUIPMENT', 'OFFICE', 'TRANSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER');

-- CreateTable
CREATE TABLE "document_counters" (
    "organization_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("organization_id","key")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "student_id" UUID,
    "invoice_number" VARCHAR(32) NOT NULL,
    "issue_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "final_amount" DECIMAL(14,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "description" VARCHAR(1000),
    "created_by_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "student_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "payment_date" DATE NOT NULL,
    "cashier_id" UUID NOT NULL,
    "cash_session_id" UUID,
    "transaction_id" VARCHAR(100) NOT NULL,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "refunded_by_id" UUID NOT NULL,
    "refunded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cash_session_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "opening_balance" DECIMAL(14,2) NOT NULL,
    "expected_balance" DECIMAL(14,2),
    "closing_balance" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_method" "ExpensePaymentMethod" NOT NULL,
    "description" VARCHAR(1000),
    "expense_date" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,
    "cash_session_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_organization_id_branch_id_status_idx" ON "invoices"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "invoices_organization_id_family_id_idx" ON "invoices"("organization_id", "family_id");

-- CreateIndex
CREATE INDEX "invoices_organization_id_student_id_idx" ON "invoices"("organization_id", "student_id");

-- CreateIndex
CREATE INDEX "invoices_organization_id_status_due_date_idx" ON "invoices"("organization_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_organization_id_issue_date_idx" ON "invoices"("organization_id", "issue_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organization_id_invoice_number_key" ON "invoices"("organization_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_organization_id_key" ON "invoices"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_organization_id_branch_id_key" ON "invoices"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_branch_id_payment_date_idx" ON "payments"("organization_id", "branch_id", "payment_date");

-- CreateIndex
CREATE INDEX "payments_organization_id_payment_date_method_idx" ON "payments"("organization_id", "payment_date", "method");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_family_id_idx" ON "payments"("organization_id", "family_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_student_id_idx" ON "payments"("organization_id", "student_id");

-- CreateIndex
CREATE INDEX "payments_cashier_id_idx" ON "payments"("cashier_id");

-- CreateIndex
CREATE INDEX "payments_cash_session_id_idx" ON "payments"("cash_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_transaction_id_key" ON "payments"("organization_id", "transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_id_organization_id_branch_id_key" ON "payments"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_invoice_id_idx" ON "refunds"("invoice_id");

-- CreateIndex
CREATE INDEX "refunds_organization_id_branch_id_refunded_at_idx" ON "refunds"("organization_id", "branch_id", "refunded_at");

-- CreateIndex
CREATE INDEX "refunds_cash_session_id_idx" ON "refunds"("cash_session_id");

-- CreateIndex
CREATE INDEX "cash_sessions_organization_id_branch_id_status_idx" ON "cash_sessions"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_organization_id_cashier_id_status_idx" ON "cash_sessions"("organization_id", "cashier_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_id_organization_id_branch_id_key" ON "cash_sessions"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "expenses_organization_id_branch_id_expense_date_idx" ON "expenses"("organization_id", "branch_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_organization_id_category_idx" ON "expenses"("organization_id", "category");

-- CreateIndex
CREATE INDEX "expenses_cash_session_id_idx" ON "expenses"("cash_session_id");

-- AddForeignKey
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_family_id_organization_id_fkey" FOREIGN KEY ("family_id", "organization_id") REFERENCES "families"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_organization_id_branch_id_fkey" FOREIGN KEY ("invoice_id", "organization_id", "branch_id") REFERENCES "invoices"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_family_id_organization_id_fkey" FOREIGN KEY ("family_id", "organization_id") REFERENCES "families"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_organization_id_branch_id_fkey" FOREIGN KEY ("cash_session_id", "organization_id", "branch_id") REFERENCES "cash_sessions"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_organization_id_branch_id_fkey" FOREIGN KEY ("payment_id", "organization_id", "branch_id") REFERENCES "payments"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoice_id_organization_id_fkey" FOREIGN KEY ("invoice_id", "organization_id") REFERENCES "invoices"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_refunded_by_id_fkey" FOREIGN KEY ("refunded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_cash_session_id_organization_id_branch_id_fkey" FOREIGN KEY ("cash_session_id", "organization_id", "branch_id") REFERENCES "cash_sessions"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cash_session_id_organization_id_branch_id_fkey" FOREIGN KEY ("cash_session_id", "organization_id", "branch_id") REFERENCES "cash_sessions"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written (Prisma cannot express these in schema.prisma)

-- One OPEN cash session per cashier per organization.
CREATE UNIQUE INDEX "cash_sessions_one_open_per_cashier"
  ON "cash_sessions" ("organization_id", "cashier_id") WHERE "status" = 'OPEN';

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_valid" CHECK (
  "amount" >= 0 AND "discount" >= 0 AND "discount" <= "amount" AND "final_amount" = "amount" - "discount"
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opening_non_negative" CHECK ("opening_balance" >= 0);

import { randomUUID } from 'node:crypto';
import {
  type Api,
  createFamily,
  createStudent,
  memberOf,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Finance (e2e)', () => {
  let ctx: TestContext;
  let t: Tenant;
  let family: { id: string };
  let student: { id: string };

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    t = await setupTenant(ctx);
    family = await createFamily(t.as, t.termiz.id);
    student = await createStudent(t.as, family.id, t.termiz.id);
  });
  afterAll(() => ctx.app.close());

  const today = () => new Date().toISOString().slice(0, 10);
  const daysFromNow = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  type IssuedInvoice = { id: string; invoiceNumber: string; status: string; debt: string };

  async function issue(as: Api, body: Record<string, unknown> = {}): Promise<IssuedInvoice> {
    const res = await as
      .post('/invoices')
      .send({
        familyId: family.id,
        studentId: student.id,
        amount: 500000,
        dueDate: daysFromNow(10),
        branchId: t.termiz.id,
        ...body,
      })
      .expect(201);
    return res.body.data as IssuedInvoice;
  }

  const pay = (as: Api, invoiceId: string, amount: number, extra: Record<string, unknown> = {}) =>
    as.post('/payments').send({ invoiceId, amount, method: 'CARD', ...extra });

  const openDrawer = (as: Api, openingBalance = 100000) =>
    as.post('/cash-sessions').send({ openingBalance, branchId: t.termiz.id });

  describe('invoices', () => {
    it('numbers invoices gap-free per organization and derives finalAmount', async () => {
      const first = await issue(t.as, { discount: 50000 });
      const second = await issue(t.as);
      const year = new Date().getUTCFullYear();

      expect(first).toMatchObject({
        invoiceNumber: `INV-${year}-000001`,
        amount: '500000',
        discount: '50000',
        finalAmount: '450000',
        paid: '0',
        debt: '450000',
        status: 'PENDING',
      });
      expect(second.invoiceNumber).toBe(`INV-${year}-000002`);
    });

    it('a fully discounted invoice is PAID from the start', async () => {
      const invoice = await issue(t.as, { discount: 500000 });
      expect(invoice).toMatchObject({ status: 'PAID', debt: '0' });
    });

    it('validates discount, student ↔ family and due date', async () => {
      const bad = await t.as
        .post('/invoices')
        .send({ familyId: family.id, amount: 100, discount: 200, dueDate: today() })
        .set('X-Branch-Id', t.termiz.id)
        .expect(400);
      expect(bad.body.code).toBe('INVALID_DISCOUNT');

      const other = await createFamily(t.as, t.termiz.id, 'Boshqa oila');
      const mismatch = await t.as
        .post('/invoices')
        .send({ familyId: other.id, studentId: student.id, amount: 100, dueDate: today() })
        .set('X-Branch-Id', t.termiz.id)
        .expect(400);
      expect(mismatch.body.code).toBe('STUDENT_NOT_IN_FAMILY');

      const early = await t.as
        .post('/invoices')
        .send({ familyId: family.id, amount: 100, issueDate: today(), dueDate: daysFromNow(-1) })
        .set('X-Branch-Id', t.termiz.id)
        .expect(400);
      expect(early.body.code).toBe('INVALID_DATE_RANGE');
    });

    it('derives OVERDUE and filters by it', async () => {
      const late = await issue(t.as, { issueDate: daysFromNow(-20), dueDate: daysFromNow(-5) });
      await issue(t.as);

      const detail = await t.as.get(`/invoices/${late.id}`).expect(200);
      expect(detail.body.data.status).toBe('OVERDUE');

      const overdue = await t.as.get('/invoices?status=OVERDUE').expect(200);
      const overdueIds = (overdue.body.data.items as { id: string }[]).map((i) => i.id);
      expect(overdueIds).toEqual([late.id]);

      const pending = await t.as.get('/invoices?status=PENDING').expect(200);
      expect(pending.body.data.meta.total).toBe(1);

      const flag = await t.as.get('/invoices?overdue=true').expect(200);
      expect(flag.body.data.meta.total).toBe(1);
    });

    it('cannot lower the final amount below what is paid; cancel needs no money held', async () => {
      const invoice = await issue(t.as);
      await pay(t.as, invoice.id, 300000).expect(201);

      const below = await t.as
        .patch(`/invoices/${invoice.id}`)
        .send({ discount: 300000 })
        .expect(409);
      expect(below.body.code).toBe('INVOICE_AMOUNT_BELOW_PAID');

      const held = await t.as.post(`/invoices/${invoice.id}/cancel`).send({}).expect(409);
      expect(held.body.code).toBe('INVOICE_HAS_PAYMENTS');

      const fresh = await issue(t.as);
      const cancelled = await t.as
        .post(`/invoices/${fresh.id}/cancel`)
        .send({ reason: 'Duplicate' })
        .expect(200);
      expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED', debt: '0' });

      const payCancelled = await pay(t.as, fresh.id, 1000).expect(409);
      expect(payCancelled.body.code).toBe('INVOICE_CANCELLED');
    });
  });

  describe('payments & refunds', () => {
    it('partial → paid, with debt tracking and overpayment protection', async () => {
      const invoice = await issue(t.as);

      await pay(t.as, invoice.id, 200000).expect(201);
      let detail = await t.as.get(`/invoices/${invoice.id}`).expect(200);
      expect(detail.body.data).toMatchObject({ status: 'PARTIAL', paid: '200000', debt: '300000' });

      const over = await pay(t.as, invoice.id, 300001).expect(409);
      expect(over.body.code).toBe('PAYMENT_EXCEEDS_BALANCE');

      await pay(t.as, invoice.id, 300000).expect(201);
      detail = await t.as.get(`/invoices/${invoice.id}`).expect(200);
      expect(detail.body.data).toMatchObject({ status: 'PAID', debt: '0' });
      expect(detail.body.data.payments).toHaveLength(2);
    });

    it('rejects future payment dates and duplicate transaction ids', async () => {
      const invoice = await issue(t.as);
      const future = await pay(t.as, invoice.id, 1000, { paymentDate: daysFromNow(2) }).expect(400);
      expect(future.body.code).toBe('PAYMENT_DATE_IN_FUTURE');

      const transactionId = randomUUID();
      await pay(t.as, invoice.id, 1000, { transactionId }).expect(201);
      const again = await pay(t.as, invoice.id, 1000, { transactionId }).expect(409);
      expect(again.body.code).toBe('PAYMENT_ALREADY_EXISTS');

      const payments = await t.as.get(`/payments?invoiceId=${invoice.id}`).expect(200);
      expect(payments.body.data.meta.total).toBe(1);
    });

    it('concurrent payments cannot together exceed the invoice', async () => {
      const invoice = await issue(t.as);
      const results = await Promise.all([
        pay(t.as, invoice.id, 300000),
        pay(t.as, invoice.id, 300000),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('a refund re-opens the debt and is capped by the payment', async () => {
      const invoice = await issue(t.as);
      const payment = await pay(t.as, invoice.id, 500000).expect(201);
      const paymentId = payment.body.data.id as string;

      const tooMuch = await t.as
        .post(`/payments/${paymentId}/refunds`)
        .send({ amount: 500001, reason: 'Too much' })
        .expect(409);
      expect(tooMuch.body.code).toBe('REFUND_EXCEEDS_PAYMENT');

      await t.as
        .post(`/payments/${paymentId}/refunds`)
        .send({ amount: 100000, reason: 'Missed lessons' })
        .expect(201);

      const detail = await t.as.get(`/invoices/${invoice.id}`).expect(200);
      expect(detail.body.data).toMatchObject({
        status: 'PARTIAL',
        paid: '500000',
        refunded: '100000',
        debt: '100000',
      });
      const paymentDetail = await t.as.get(`/payments/${paymentId}`).expect(200);
      expect(paymentDetail.body.data).toMatchObject({ refunded: '100000' });
      expect(paymentDetail.body.data.refunds).toHaveLength(1);
    });
  });

  describe('cash sessions & expenses', () => {
    it('cash needs an open drawer; close reconciles expected vs counted', async () => {
      const invoice = await issue(t.as);
      const noDrawer = await pay(t.as, invoice.id, 100000, { method: 'CASH' }).expect(409);
      expect(noDrawer.body.code).toBe('CASH_SESSION_REQUIRED');

      const opened = await openDrawer(t.as).expect(201);
      const sessionId = opened.body.data.id as string;
      const twice = await openDrawer(t.as).expect(409);
      expect(twice.body.code).toBe('CASH_SESSION_ALREADY_OPEN');

      const cash = await pay(t.as, invoice.id, 400000, { method: 'CASH' }).expect(201);
      expect(cash.body.data.cashSessionId).toBe(sessionId);
      await t.as
        .post(`/payments/${cash.body.data.id}/refunds`)
        .send({ amount: 50000, reason: 'Overcharge' })
        .expect(201);
      await t.as
        .post('/expenses')
        .send({ category: 'OFFICE', amount: 20000, paymentMethod: 'CASH', branchId: t.termiz.id })
        .expect(201);
      await t.as
        .post('/expenses')
        .send({
          category: 'RENT',
          amount: 999999,
          paymentMethod: 'BANK_TRANSFER',
          branchId: t.termiz.id,
        })
        .expect(201);

      const current = await t.as.get('/cash-sessions/current').expect(200);
      // 100000 + 400000 − 50000 − 20000
      expect(current.body.data.totals).toMatchObject({
        cashIn: '400000',
        refundsOut: '50000',
        expensesOut: '20000',
        expectedBalance: '430000',
        paymentCount: 1,
      });

      const cashier = await memberOf(ctx, t, 'CASHIER', [t.termiz.id]);
      const notOwner = await cashier.as
        .post(`/cash-sessions/${sessionId}/close`)
        .send({ closingBalance: 0 })
        .expect(403);
      expect(notOwner.body.code).toBe('CASH_SESSION_NOT_OWNER');

      const closed = await t.as
        .post(`/cash-sessions/${sessionId}/close`)
        .send({ closingBalance: 425000 })
        .expect(200);
      expect(closed.body.data).toMatchObject({
        status: 'CLOSED',
        expectedBalance: '430000',
        closingBalance: '425000',
        difference: '-5000',
      });

      const again = await t.as
        .post(`/cash-sessions/${sessionId}/close`)
        .send({ closingBalance: 1 })
        .expect(409);
      expect(again.body.code).toBe('CASH_SESSION_CLOSED');

      const late = await pay(t.as, invoice.id, 1000, { method: 'CASH' }).expect(409);
      expect(late.body.code).toBe('CASH_SESSION_REQUIRED');
    });

    it('filters expenses and locks cash expense amounts after close', async () => {
      const opened = await openDrawer(t.as).expect(201);
      const expense = await t.as
        .post('/expenses')
        .send({ category: 'OFFICE', amount: 10000, paymentMethod: 'CASH', branchId: t.termiz.id })
        .expect(201);
      await t.as
        .post('/expenses')
        .send({ category: 'MARKETING', amount: 5000, paymentMethod: 'CARD', branchId: t.termiz.id })
        .expect(201);

      const office = await t.as.get('/expenses?category=OFFICE').expect(200);
      expect(office.body.data.meta.total).toBe(1);

      await t.as.patch(`/expenses/${expense.body.data.id}`).send({ amount: 12000 }).expect(200);
      await t.as
        .post(`/cash-sessions/${opened.body.data.id}/close`)
        .send({ closingBalance: 88000 })
        .expect(200);
      const locked = await t.as
        .patch(`/expenses/${expense.body.data.id}`)
        .send({ amount: 1 })
        .expect(409);
      expect(locked.body.code).toBe('CASH_SESSION_CLOSED');
      await t.as
        .patch(`/expenses/${expense.body.data.id}`)
        .send({ description: 'Paper' })
        .expect(200);
    });
  });

  describe('summaries & reports', () => {
    it('family summary and the finance report agree', async () => {
      const a = await issue(t.as);
      await issue(t.as, { amount: 200000, issueDate: daysFromNow(-20), dueDate: daysFromNow(-1) });
      await pay(t.as, a.id, 150000).expect(201);
      await t.as
        .post('/expenses')
        .send({ category: 'RENT', amount: 40000, paymentMethod: 'CARD', branchId: t.termiz.id })
        .expect(201);

      const summary = await t.as.get(`/invoices/summary?familyId=${family.id}`).expect(200);
      expect(summary.body.data).toMatchObject({
        billed: '700000',
        paid: '150000',
        debt: '550000',
        invoiceCount: 2,
        overdueCount: 1,
      });

      const report = await t.as
        // +1 day: `today()` is UTC, business dates follow the organization's timezone.
        .get(`/reports/finance/summary?from=${daysFromNow(-30)}&to=${daysFromNow(1)}`)
        .expect(200);
      expect(report.body.data).toMatchObject({
        totalInvoiced: '700000',
        invoiceCount: 2,
        totalPaid: '150000',
        paymentCount: 1,
        totalRefunded: '0',
        netPaid: '150000',
        totalExpenses: '40000',
        netRevenue: '110000',
        totalDebt: '550000',
        overdueDebt: '200000',
      });
      expect(report.body.data.byMethod).toEqual({
        CASH: { amount: '0', count: 0 },
        CARD: { amount: '150000', count: 1 },
        BANK_TRANSFER: { amount: '0', count: 0 },
        ONLINE: { amount: '0', count: 0 },
        OTHER: { amount: '0', count: 0 },
      });
    });

    it('requires familyId or studentId for a summary', async () => {
      await t.as.get('/invoices/summary').expect(400);
    });
  });

  describe('access control', () => {
    it('cashier default: pays but cannot issue invoices or record expenses', async () => {
      const cashier = await memberOf(ctx, t, 'CASHIER', [t.termiz.id]);
      await cashier.as
        .post('/invoices')
        .send({ familyId: family.id, amount: 1000, dueDate: today(), branchId: t.termiz.id })
        .expect(403);
      await cashier.as
        .post('/expenses')
        .send({ category: 'OFFICE', amount: 1, paymentMethod: 'CARD', branchId: t.termiz.id })
        .expect(403);

      const invoice = await issue(t.as);
      await pay(cashier.as, invoice.id, 1000).expect(201);
    });

    it('teacher has no finance access', async () => {
      const teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      await teacher.as.get('/invoices').expect(403);
    });

    it('blocks other branches and other organizations', async () => {
      const invoice = await issue(t.as);
      const denovCashier = await memberOf(ctx, t, 'CASHIER', [t.denov.id]);

      const branchDenied = await denovCashier.as.get(`/invoices/${invoice.id}`).expect(403);
      expect(branchDenied.body.code).toBe('BRANCH_ACCESS_DENIED');
      await pay(denovCashier.as, invoice.id, 1000).expect(403);
      const list = await denovCashier.as.get('/invoices').expect(200);
      expect(list.body.data.meta.total).toBe(0);

      const other = await setupTenant(ctx, 'Other Academy');
      const crossOrg = await other.as.get(`/invoices/${invoice.id}`).expect(404);
      expect(crossOrg.body.code).toBe('INVOICE_NOT_FOUND');
      await pay(other.as, invoice.id, 1000).expect(404);
    });
  });
});

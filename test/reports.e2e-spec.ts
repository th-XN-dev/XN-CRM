import { memberOf, setupTenant, type Tenant } from './utils/academic';
import { type Business, orgToday, seedBusiness } from './utils/business';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Reports & Dashboard (e2e)', () => {
  let ctx: TestContext;
  let t: Tenant;
  let b: Business;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    t = await setupTenant(ctx);
    b = await seedBusiness(t.as, t);
  });
  afterAll(() => ctx.app.close());

  // Report bodies are loosely typed on purpose: assertions pin their shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Report = Record<string, any>;
  const get = async (url: string) => (await t.as.get(url).expect(200)).body.data as Report;

  describe('finance', () => {
    it('summary: invoiced, paid, expenses, net revenue, debt, every method', async () => {
      const data = await get('/reports/finance/summary');
      expect(data).toMatchObject({
        period: { name: 'month', timezone: 'Asia/Tashkent' },
        totalInvoiced: '500000',
        totalPaid: '300000',
        totalRefunded: '0',
        totalExpenses: '100000',
        netRevenue: '200000',
        totalDebt: '200000',
        overdueDebt: '0',
      });
      expect(Object.keys(data.byMethod)).toEqual([
        'CASH',
        'CARD',
        'BANK_TRANSFER',
        'ONLINE',
        'OTHER',
      ]);
      expect(data.byMethod.CARD).toEqual({ amount: '300000', count: 1 });
    });

    it('revenue and expenses: zero-filled series with the right bucket', async () => {
      const revenue = await get('/reports/finance/revenue?period=week');
      expect(revenue).toMatchObject({ granularity: 'day', totalIncome: '300000' });
      expect(revenue.series).toHaveLength(7);
      const series = revenue.series as { bucket: string }[];
      expect(series.find((p) => p.bucket === orgToday())).toMatchObject({
        income: '300000',
        payments: 1,
        net: '300000',
      });

      const year = await get('/reports/finance/revenue?period=year');
      expect(year.granularity).toBe('month');
      expect(year.series).toHaveLength(12);

      const expenses = await get('/reports/finance/expenses');
      expect(expenses).toMatchObject({ totalExpenses: '100000' });
      expect(expenses.byCategory).toEqual([{ category: 'RENT', amount: '100000', count: 1 }]);
    });

    it('debt aging and payments by cashier', async () => {
      const debt = await get('/reports/finance/debt');
      expect(debt).toMatchObject({ totalDebt: '200000', overdueDebt: '0' });
      expect(debt.aging[0]).toEqual({ bucket: 'current', invoices: 1, amount: '200000' });
      expect(debt.topDebtors.items).toEqual([
        expect.objectContaining({ familyId: b.familyId, invoices: 1, amount: '200000' }),
      ]);
      expect(debt.topDebtors.meta).toMatchObject({ total: 1, page: 1 });

      const payments = await get('/reports/finance/payments');
      expect(payments.byCashier).toEqual([
        expect.objectContaining({ cashierId: t.owner.id, amount: '300000', count: 1 }),
      ]);
    });
  });

  describe('students & attendance', () => {
    it('student summary, growth and status (with group filter)', async () => {
      expect(await get('/reports/students/summary')).toMatchObject({
        totalStudents: 3,
        active: 3,
        frozen: 0,
        newStudents: 3,
        leftStudents: 0,
        growth: 3,
      });
      expect(await get(`/reports/students/summary?groupId=${b.groupId}`)).toMatchObject({
        totalStudents: 2,
      });
      const growth = await get('/reports/students/growth');
      expect(growth).toMatchObject({ joined: 3, left: 0 });
      const status = await get('/reports/students/status');
      expect(status.byStatus).toEqual({ ACTIVE: 3, FROZEN: 0, GRADUATED: 0, LEFT: 0 });
      expect(status.byBranch).toEqual([
        expect.objectContaining({ branchId: t.termiz.id, ACTIVE: 3 }),
      ]);
    });

    it('attendance summary and rankings use (PRESENT + LATE) / TOTAL', async () => {
      expect(await get('/reports/attendance/summary')).toMatchObject({
        totalLessons: 1,
        totalMarks: 2,
        present: 1,
        absent: 1,
        attendanceRate: 50,
      });
      expect(await get(`/reports/attendance/summary?teacherId=${b.teacherId}`)).toMatchObject({
        totalMarks: 2,
      });
      const groups = await get('/reports/attendance/groups');
      expect(groups.items).toEqual([
        expect.objectContaining({ id: b.groupId, total: 2, lessons: 1, attendanceRate: 50 }),
      ]);
      const students = await get('/reports/attendance/students?limit=1');
      expect(students.meta).toMatchObject({ total: 2, totalPages: 2 });
      // Lowest rate first: Vali was absent.
      expect(students.items[0]).toMatchObject({ id: b.studentIds.vali, attendanceRate: 0 });
    });
  });

  describe('leads & tasks', () => {
    it('lead summary, sources and pipeline', async () => {
      expect(await get('/reports/leads/summary')).toMatchObject({
        totalLeads: 1,
        converted: 1,
        trial: 0,
        trialAttendanceRate: 0,
      });
      const sources = await get('/reports/leads/sources');
      expect(sources.totalLeads).toBe(1);
      expect((sources.bySource as unknown[]).at(-1)).toMatchObject({
        sourceId: null,
        total: 1,
        conversionRate: 100,
      });
      expect(sources.bySource.length).toBeGreaterThanOrEqual(9); // seeded default sources
      const pipeline = await get('/reports/leads/pipeline');
      expect(pipeline.stages).toHaveLength(5);
      expect(pipeline.byStatus).toMatchObject({ CONVERTED: 1, NEW: 0 });
    });

    it('task summary and per-employee rows', async () => {
      expect(await get('/reports/tasks/summary')).toMatchObject({ total: 1, todo: 1, overdue: 0 });
      const employees = await get('/reports/tasks/employees');
      expect(employees.items).toEqual([
        expect.objectContaining({
          employeeId: b.employeeId,
          assigned: 1,
          completed: 0,
          completionRate: 0,
        }),
      ]);
    });
  });

  describe('dashboard', () => {
    it('owner sees every section', async () => {
      const data = await get('/dashboard/overview?period=month');
      expect(data).toMatchObject({
        students: { total: 3, active: 3, frozen: 0, newStudents: 3 },
        families: { active: 2 }, // the lead conversion created its own family
        groups: { active: 1 },
        teachers: { active: 1 },
        attendance: { today: { totalMarks: 2, present: 1, absent: 1 }, attendanceRate: 50 },
        finance: {
          todayPayments: '300000',
          revenue: '300000',
          expenses: '100000',
          outstandingDebt: '200000',
        },
        leads: { newLeads: 1, converted: 1, conversionRate: 100 },
        tasks: { open: 1, overdue: 0 },
        notifications: { unread: 0 },
      });
      const custom = await get(`/dashboard/overview?from=${orgToday(-1)}&to=${orgToday()}`);
      expect(custom.period).toMatchObject({ name: 'custom', to: orgToday() });
    });

    it('sections follow the caller permissions', async () => {
      const teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      const teacherView = (await teacher.as.get('/dashboard/overview').expect(200)).body.data;
      expect(teacherView).toMatchObject({
        students: null,
        finance: null,
        leads: null,
        tasks: null,
        notifications: { unread: 0 },
      });
      await teacher.as.get('/reports/finance/summary').expect(403);
      await teacher.as.get('/reports/students/summary').expect(403);

      const cashier = await memberOf(ctx, t, 'CASHIER', [t.termiz.id]);
      const cashierView = (await cashier.as.get('/dashboard/overview').expect(200)).body.data;
      expect(cashierView.finance).toBeNull(); // no finance.report.read
      expect(cashierView.students).toMatchObject({ total: 3 });
    });
  });

  describe('filters', () => {
    it('validates periods, pagination and branch access', async () => {
      const partial = await t.as.get('/reports/finance/summary?from=2026-09-01').expect(400);
      expect(partial.body.code).toBe('INVALID_DATE_RANGE');
      await t.as.get('/reports/finance/summary?period=decade').expect(422);
      await t.as.get('/reports/attendance/groups?limit=100000').expect(422);

      // Another organization's branch id never reaches its data: every query is
      // pinned to the caller's organization.
      const other = await setupTenant(ctx, 'Other Academy');
      expect(await get(`/reports/finance/summary?branchId=${other.termiz.id}`)).toMatchObject({
        totalPaid: '0',
        totalInvoiced: '0',
      });
      // Another branch of the same organization: no data there.
      expect(await get(`/reports/finance/summary?branchId=${t.denov.id}`)).toMatchObject({
        totalPaid: '0',
      });
    });
  });
});

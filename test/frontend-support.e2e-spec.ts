import { createLead, memberOf, setupTenant, type Tenant } from './utils/academic';
import { type Business, orgToday, seedBusiness } from './utils/business';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

/** Read models the web app's screens are built on: debtors, refunds, timetable, members, dashboard. */
describe('Frontend support endpoints (e2e)', () => {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Body = Record<string, any>;
  const get = async (url: string) => (await t.as.get(url).expect(200)).body.data as Body;

  describe('dashboard', () => {
    it('adds the operational counters the home screen shows', async () => {
      const data = await get('/dashboard/overview?period=month');
      expect(data).toMatchObject({
        students: { total: 3, active: 3, graduated: 0, left: 0 },
        families: { total: 2, active: 2 },
        groups: { active: 1, capacity: 15, enrolled: 2 },
        finance: { overdueInvoices: 0 },
        leads: { trialBooked: 0, followUpsDue: 0 },
        tasks: { open: 1, overdue: 0, dueToday: 0, completed: 0 },
        // The owner has no employee profile, so nothing is assigned to them.
        myTasks: { open: 0, overdue: 0, dueToday: 0, completed: 0 },
      });

      await t.as.patch(`/tasks/${b.taskId}/status`).send({ status: 'COMPLETED' }).expect(200);
      const lead = await createLead(t.as, {
        branchId: t.termiz.id,
        name: 'Follow me',
        phone: '+998907770001',
      });
      await t.as
        .patch(`/leads/${lead.id}/follow-up`)
        .send({ nextFollowUpAt: new Date(Date.now() - 3_600_000).toISOString() })
        .expect(200);

      const after = await get('/dashboard/overview?period=month');
      expect(after.tasks).toMatchObject({ open: 0, completed: 1 });
      expect(after.leads).toMatchObject({ followUpsDue: 1 });
    });

    it('shows a cashier their own tasks but not team statistics', async () => {
      const cashier = await memberOf(ctx, t, 'CASHIER', [t.termiz.id]);
      const view = (await cashier.as.get('/dashboard/overview').expect(200)).body.data as Body;
      expect(view.tasks).toBeNull();
      expect(view.myTasks).toMatchObject({ open: 0 });
    });
  });

  describe('lead follow-ups', () => {
    it('"today" is the organization calendar day, not the UTC one', async () => {
      const lead = await createLead(t.as, {
        branchId: t.termiz.id,
        name: 'Early bird',
        phone: '+998907770002',
      });
      // 00:30 in Tashkent is still the previous day in UTC.
      const earlyToday = `${orgToday()}T00:30:00+05:00`;
      await t.as
        .patch(`/leads/${lead.id}/follow-up`)
        .send({ nextFollowUpAt: earlyToday })
        .expect(200);

      const ids = async (filter: string) =>
        ((await get(`/leads/follow-ups?filter=${filter}`)).items as { id: string }[]).map(
          (l) => l.id,
        );
      expect(await ids('today')).toContain(lead.id);
      expect(await ids('overdue')).not.toContain(lead.id);
    });
  });

  describe('debtors', () => {
    beforeAll(async () => {
      // A family-level charge that is already overdue, on top of Ali's partly paid invoice.
      await t.as
        .post('/invoices')
        .send({
          familyId: b.familyId,
          amount: 100000,
          issueDate: orgToday(-10),
          dueDate: orgToday(-3),
          branchId: t.termiz.id,
        })
        .expect(201);
    });

    it('groups debt by family with a per-student breakdown', async () => {
      const data = await get('/debtors');
      expect(data).toMatchObject({
        totalDebt: '300000',
        overdueDebt: '100000',
        meta: { total: 1, page: 1 },
      });
      expect(data.items[0]).toMatchObject({
        familyId: b.familyId,
        familyName: 'Family A',
        studentsCount: 1,
        invoices: 2,
        amount: '300000',
        overdueAmount: '100000',
        hasPartial: true,
        oldestDueDate: `${orgToday(-3)}T00:00:00.000Z`,
      });
      expect(data.items[0].students).toEqual([
        {
          studentId: b.studentIds.ali,
          firstName: 'Ali',
          lastName: expect.any(String),
          invoices: 1,
          amount: '200000',
        },
        { studentId: null, firstName: null, lastName: null, invoices: 1, amount: '100000' },
      ]);
    });

    it('filters by overdue, partial, amount, due date and search', async () => {
      const total = async (query: string) =>
        ((await get(`/debtors?${query}`)).meta as { total: number }).total;
      expect(await total('overdue=true')).toBe(1);
      expect(await total('partial=true')).toBe(1);
      expect(await total('minAmount=300000')).toBe(1);
      expect(await total('minAmount=300001')).toBe(0);
      expect(await total('search=family%20a')).toBe(1);
      expect(await total('search=nobody')).toBe(0);
      // Only the overdue invoice is due by yesterday.
      const due = await get(`/debtors?dueTo=${orgToday(-1)}`);
      expect(due.items[0]).toMatchObject({ amount: '100000', invoices: 1 });
      expect(await total(`branchId=${t.denov.id}`)).toBe(0);
    });

    it('is open to cashiers (finance.read), closed to teachers', async () => {
      const cashier = await memberOf(ctx, t, 'CASHIER', [t.termiz.id]);
      await cashier.as.get('/debtors').expect(200);
      const teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      await teacher.as.get('/debtors').expect(403);
      await t.as.get('/debtors?minAmount=-1').expect(422);
    });
  });

  describe('refunds', () => {
    it('lists refunds with their payment, invoice, family and who refunded', async () => {
      const refund = await t.as
        .post(`/payments/${b.paymentId}/refunds`)
        .send({ amount: 50000, reason: 'Overpaid' })
        .expect(201);
      const data = await get('/refunds');
      expect(data.meta.total).toBe(1);
      expect(data.items[0]).toMatchObject({
        id: refund.body.data.id,
        amount: '50000',
        reason: 'Overpaid',
        payment: { id: b.paymentId, method: 'CARD', amount: '300000' },
        invoice: { id: b.invoiceId },
        family: { id: b.familyId, name: 'Family A' },
        refundedBy: { id: t.owner.id },
      });
      expect((await get(`/refunds?branchId=${t.denov.id}`)).meta.total).toBe(0);
      expect((await get(`/refunds?from=${orgToday(1)}`)).meta.total).toBe(0);
    });
  });

  describe('timetable', () => {
    beforeAll(async () => {
      await t.as
        .post(`/groups/${b.groupId}/schedules`)
        .send({ dayOfWeek: 'WEDNESDAY', startTime: '14:00', endTime: '15:30' })
        .expect(201);
      await t.as
        .post(`/groups/${b.groupId}/schedules`)
        .send({ dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '10:30' })
        .expect(201);
    });

    it('lists slots across groups, Monday first, with group and teacher', async () => {
      const slots = (await t.as.get('/schedules').expect(200)).body.data as Body[];
      expect(slots.map((s) => `${s.dayOfWeek} ${s.startTime}`)).toEqual([
        'MONDAY 09:00',
        'WEDNESDAY 14:00',
      ]);
      expect(slots[0].group).toMatchObject({
        id: b.groupId,
        name: 'Group A',
        teacher: { id: b.teacherId, firstName: 'TeacherA' },
      });
      const byTeacher = (await t.as.get(`/schedules?teacherId=${b.teacherId}`).expect(200)).body
        .data;
      expect(byTeacher).toHaveLength(2);
      const otherBranch = (await t.as.get(`/schedules?branchId=${t.denov.id}`).expect(200)).body
        .data;
      expect(otherBranch).toHaveLength(0);
    });

    it('a teacher sees only the groups they teach', async () => {
      const teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      expect((await teacher.as.get('/schedules').expect(200)).body.data).toHaveLength(0);
      await t.as.patch(`/teachers/${b.teacherId}`).send({ userId: teacher.user.id }).expect(200);
      expect((await teacher.as.get('/schedules').expect(200)).body.data).toHaveLength(2);
    });
  });

  describe('members', () => {
    it('lists active members by name and role, optionally by branch', async () => {
      const denovOnly = await memberOf(ctx, t, 'MANAGER', [t.denov.id]);
      const all = (await t.as.get(`/organizations/${t.orgId}/members`).expect(200)).body
        .data as Body[];
      expect(all.find((m) => m.userId === t.owner.id)).toMatchObject({
        role: 'DIRECTOR',
        allBranches: true,
      });
      expect(all.find((m) => m.userId === denovOnly.user.id)).toMatchObject({
        role: 'MANAGER',
        branchIds: [t.denov.id],
      });
      expect(Object.keys(all[0]).sort()).toEqual([
        'allBranches',
        'branchIds',
        'name',
        'role',
        'userId',
      ]);

      const termiz = (
        await t.as.get(`/organizations/${t.orgId}/members?branchId=${t.termiz.id}`).expect(200)
      ).body.data as Body[];
      expect(termiz.map((m) => m.userId as string)).not.toContain(denovOnly.user.id);

      const cashier = await memberOf(ctx, t, 'CASHIER', [t.termiz.id]);
      await cashier.as.get(`/organizations/${t.orgId}/members`).expect(403);
    });
  });
});

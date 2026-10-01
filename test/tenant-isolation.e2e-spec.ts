import { NotificationType } from '@prisma/client';
import { BackgroundTasks } from '../src/common/events/background-tasks';
import { NotificationsService } from '../src/notifications/notifications.service';
import { api, setupTenant, type Tenant } from './utils/academic';
import { type Business, seedBusiness } from './utils/business';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

/**
 * Phase 8 critical test: two complete organizations. Neither owner (full
 * permissions, all branches) can read, change or reference the other's data —
 * by id, by header, through lists, reports, dashboard or audit.
 */
describe('Tenant isolation: organization A vs organization B (e2e)', () => {
  let ctx: TestContext;
  let a: { tenant: Tenant; data: Business; notificationId: string; auditId: string };
  let b: typeof a;

  async function setup(name: string, tag: string): Promise<typeof a> {
    const tenant = await setupTenant(ctx, name);
    const data = await seedBusiness(tenant.as, tenant, tag);
    await ctx.app.get(NotificationsService).notify({
      organizationId: tenant.orgId,
      type: NotificationType.SYSTEM,
      eventKey: `SYSTEM:isolation-${tag}`,
      subjectUserIds: [tenant.owner.id],
      variables: { title: `Hello ${tag}`, message: 'x' },
    });
    await ctx.app.get(BackgroundTasks).idle();
    const notification = await tenant.as.get('/notifications').expect(200);
    const audit = await tenant.as.get('/audit-logs?limit=1').expect(200);
    return {
      tenant,
      data,
      notificationId: (notification.body.data.items as { id: string }[])[0].id,
      auditId: (audit.body.data.items as { id: string }[])[0].id,
    };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    a = await setup('Academy A', 'A');
    b = await setup('Academy B', 'B');
  });
  afterAll(() => ctx.app.close());

  const directions = () =>
    [
      ['A', 'B', a, b],
      ['B', 'A', b, a],
    ] as const;

  it.each(['A→B', 'B→A'])('%s: reading the other organization by id is 404', async (label) => {
    const [me, them] = label === 'A→B' ? [a, b] : [b, a];
    const as = me.tenant.as;
    const d = them.data;
    const reads = [
      `/students/${d.studentIds.ali}`,
      `/families/${d.familyId}`,
      `/groups/${d.groupId}`,
      `/courses/${d.courseId}`,
      `/teachers/${d.teacherId}`,
      `/invoices/${d.invoiceId}`,
      `/payments/${d.paymentId}`,
      `/expenses/${d.expenseId}`,
      `/leads/${d.leadId}`,
      `/employees/${d.employeeId}`,
      `/tasks/${d.taskId}`,
      `/audit-logs/${them.auditId}`,
    ];
    for (const url of reads) {
      const res = await as.get(url);
      expect({ url, status: res.status }).toEqual({ url, status: 404 });
    }
    // Notifications belong to their recipient: another tenant's id is simply not found.
    await as.patch(`/notifications/${them.notificationId}/read`).expect(404);
  });

  it.each(['A→B', 'B→A'])(
    '%s: writing to or referencing the other organization fails',
    async (label) => {
      const [me, them] = label === 'A→B' ? [a, b] : [b, a];
      const as = me.tenant.as;
      const d = them.data;

      await as.patch(`/students/${d.studentIds.ali}`).send({ notes: 'hacked' }).expect(404);
      await as
        .post('/payments')
        .send({ invoiceId: d.invoiceId, amount: 1000, method: 'CARD' })
        .expect(404);
      await as
        .post(`/payments/${d.paymentId}/refunds`)
        .send({ amount: 1, reason: 'x' })
        .expect(404);
      await as.post(`/invoices/${d.invoiceId}/cancel`).send({}).expect(404);
      await as.patch(`/tasks/${d.taskId}/status`).send({ status: 'COMPLETED' }).expect(404);
      await as.delete(`/employees/${d.employeeId}`).expect(404);
      // My (unenrolled) student into their group; an invoice for their family.
      await as
        .post('/enrollments')
        .send({
          studentId: me.data.studentIds.converted,
          groupId: d.groupId,
          startedAt: '2026-09-02',
        })
        .expect(404);
      await as
        .post('/invoices')
        .send({
          familyId: d.familyId,
          amount: 1000,
          dueDate: '2026-12-01',
          branchId: me.tenant.termiz.id,
        })
        .expect(404);
      await as
        .post('/tasks')
        .send({ title: 'x', branchId: me.tenant.termiz.id, assignedToId: d.employeeId })
        .expect(404);

      // Nothing of theirs changed.
      const student = await ctx.prisma.student.findUniqueOrThrow({
        where: { id: d.studentIds.ali },
      });
      expect(student.notes).toBeNull();
      expect(await ctx.prisma.payment.count({ where: { invoiceId: d.invoiceId } })).toBe(1);
    },
  );

  it.each(['A→B', 'B→A'])(
    '%s: switching organization context with my token is refused',
    async (label) => {
      const [me, them] = label === 'A→B' ? [a, b] : [b, a];
      const intruder = api(ctx, me.tenant.owner, them.tenant.orgId);
      for (const url of [
        '/students',
        '/payments',
        '/reports/finance/summary',
        '/dashboard/overview',
        '/audit-logs',
      ]) {
        const res = await intruder.get(url);
        expect({ url, status: res.status }).toEqual({ url, status: 403 });
      }
      const withForeignBranch = api(ctx, me.tenant.owner, me.tenant.orgId, them.tenant.termiz.id);
      expect((await withForeignBranch.get('/students')).status).toBe(403);
    },
  );

  it('lists, reports and dashboards only contain the caller organization', async () => {
    for (const [, , me, them] of directions()) {
      const as = me.tenant.as;
      const students = (await as.get('/students?limit=100').expect(200)).body.data as {
        items: { id: string }[];
      };
      const ids = students.items.map((s) => s.id);
      expect(ids).toContain(me.data.studentIds.ali);
      expect(ids).not.toContain(them.data.studentIds.ali);

      const payments = (await as.get('/payments').expect(200)).body.data as {
        items: { id: string }[];
      };
      expect(payments.items.map((p) => p.id)).toEqual([me.data.paymentId]);

      // Each organization paid 300 000: never 600 000.
      const finance = (await as.get('/reports/finance/summary').expect(200)).body.data;
      expect(finance).toMatchObject({ totalPaid: '300000', totalDebt: '200000' });
      const dashboard = (await as.get('/dashboard/overview').expect(200)).body.data;
      expect(dashboard.students.total).toBe(3);
      expect(dashboard.notifications.unread).toBe(1);

      const audit = (await as.get('/audit-logs?limit=100').expect(200)).body.data as {
        items: { organizationId: string }[];
      };
      expect(audit.items.every((row) => row.organizationId === me.tenant.orgId)).toBe(true);
    }
  });
});

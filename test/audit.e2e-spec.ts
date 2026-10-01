import { BackgroundTasks } from '../src/common/events/background-tasks';
import { memberOf, setupTenant, type Tenant } from './utils/academic';
import { type Business, seedBusiness } from './utils/business';
import { PASSWORD } from './utils/factories';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

interface AuditRow {
  id: string;
  organizationId: string | null;
  branchId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  user: { id: string; name: string } | null;
}

describe('Audit log (e2e)', () => {
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

  /** Audit rows are written right after the response: wait for them. */
  const settled = () => ctx.app.get(BackgroundTasks).idle();

  const audit = async (query = '') => {
    await settled();
    const res = await t.as.get(`/audit-logs${query}`).expect(200);
    return res.body.data as { items: AuditRow[]; meta: { total: number } };
  };

  it('records business events once each, with actor and entity', async () => {
    const { items } = await audit('?limit=100');
    const actions = items.map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'STUDENT_CREATED',
        'ENROLLMENT_CREATED',
        'ATTENDANCE_MARKED',
        'INVOICE_CREATED',
        'PAYMENT_CREATED',
        'EXPENSE_CREATED',
        'LEAD_CONVERTED',
        'EMPLOYEE_CREATED',
        'TASK_CREATED',
      ]),
    );
    expect(actions.filter((a) => a === 'PAYMENT_CREATED')).toHaveLength(1);

    const payment = items.find((row) => row.action === 'PAYMENT_CREATED')!;
    expect(payment).toMatchObject({
      organizationId: t.orgId,
      branchId: t.termiz.id,
      userId: t.owner.id,
      entityType: 'Payment',
      entityId: b.paymentId,
      user: { id: t.owner.id },
    });
    expect(payment.newData).toMatchObject({ amount: '300000', method: 'CARD' });
    expect(payment.requestId).toBeTruthy();
    expect(payment.ipAddress).toBeTruthy();
  });

  it('audits event-less mutations generically, linked to the request id', async () => {
    const res = await t.as
      .post('/courses')
      .set('X-Request-ID', 'req-audit-course-1')
      .send({ name: 'Physics', code: 'PHYS', monthlyPrice: 300000 })
      .expect(201);
    expect(res.headers['x-request-id']).toBe('req-audit-course-1');

    const { items } = await audit('?entityType=Courses&action=CREATE');
    expect(items).toHaveLength(2); // seedBusiness created one course too
    const row = items.find((r) => r.requestId === 'req-audit-course-1')!;
    expect(row).toMatchObject({
      entityId: res.body.data.id as string,
      userId: t.owner.id,
      newData: { name: 'Physics', code: 'PHYS', monthlyPrice: 300000 },
    });

    // Evented mutations are not recorded twice (no generic CREATE for payments).
    const generic = await audit('?entityType=Payments');
    expect(generic.meta.total).toBe(0);
  });

  it('records account events without secrets', async () => {
    await ctx
      .http()
      .post('/auth/login')
      .send({ login: t.owner.email, password: PASSWORD })
      .expect(200);
    await settled();
    const logins = await ctx.prisma.auditLog.findMany({
      where: { userId: t.owner.id, action: { in: ['REGISTER', 'LOGIN'] } },
    });
    expect(logins.map((row) => row.action).sort()).toEqual(['LOGIN', 'REGISTER']);
    expect(logins.every((row) => row.organizationId === null)).toBe(true);

    const everything = JSON.stringify(await ctx.prisma.auditLog.findMany());
    expect(everything).not.toMatch(/password|refreshToken|accessToken|passwordHash/i);
    expect(everything).not.toContain(PASSWORD);
  });

  it('is append-only at the database level', async () => {
    const [row] = (await audit('?limit=1')).items;
    await expect(
      ctx.prisma.auditLog.update({ where: { id: row.id }, data: { action: 'TAMPERED' } }),
    ).rejects.toThrow(/append-only/);
    await expect(ctx.prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(
      /append-only/,
    );
    const again = await t.as.get(`/audit-logs/${row.id}`).expect(200);
    expect(again.body.data.action).toBe(row.action);
  });

  it('filters and paginates', async () => {
    const byAction = await audit('?action=INVOICE_CREATED');
    expect(byAction.meta.total).toBe(1);
    const byEntity = await audit(`?entityType=Payment&entityId=${b.paymentId}`);
    expect(byEntity.items.map((r) => r.action)).toEqual(['PAYMENT_CREATED']);
    const byUser = await audit(`?userId=${t.owner.id}&limit=2`);
    expect(byUser.items).toHaveLength(2);
    expect(byUser.meta.total).toBeGreaterThan(2);
    await t.as.get('/audit-logs?action=not-an-action').expect(422);
  });

  it('is protected by permission and organization isolation', async () => {
    const manager = await memberOf(ctx, t, 'MANAGER', [t.termiz.id]);
    await manager.as.get('/audit-logs').expect(403);

    const other = await setupTenant(ctx, 'Other Academy');
    const [row] = (await audit('?limit=1')).items;
    await other.as.get(`/audit-logs/${row.id}`).expect(404);
    const otherList = (await other.as.get('/audit-logs?limit=100').expect(200)).body.data as {
      items: AuditRow[];
    };
    expect(otherList.items.every((r) => r.organizationId === other.orgId)).toBe(true);
  });
});

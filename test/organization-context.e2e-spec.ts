import { memberOf, setupTenant, type Tenant } from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Organization session context & branding (e2e)', () => {
  let ctx: TestContext;
  let t: Tenant;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    t = await setupTenant(ctx);
  });
  afterAll(() => ctx.app.close());

  it('returns branding, role, permissions and all branches for the owner', async () => {
    const res = await t.as.get(`/organizations/${t.orgId}/context`).expect(200);
    expect(res.body.data).toMatchObject({
      organization: { id: t.orgId, primaryColor: '#4F46E5', language: 'uz', currency: 'UZS' },
      membership: { role: 'DIRECTOR', allBranches: true },
    });
    expect(res.body.data.membership.permissions).toEqual(
      expect.arrayContaining(['students.read', 'finance.payment.create', 'audit.read']),
    );
    expect((res.body.data.branches as { code: string }[]).map((b) => b.code).sort()).toEqual([
      'DNV',
      'TRM',
    ]);
  });

  it('limits a branch member to their branches and permissions', async () => {
    const cashier = await memberOf(ctx, t, 'CASHIER', [t.denov.id]);
    const res = await cashier.as.get(`/organizations/${t.orgId}/context`).expect(200);
    expect(res.body.data.membership).toMatchObject({ role: 'CASHIER', allBranches: false });
    expect(res.body.data.branches).toEqual([
      { id: t.denov.id, name: 'Branch DNV', code: 'DNV', subCenterId: null },
    ]);
    expect(res.body.data.membership.permissions).not.toContain('finance.invoice.create');

    const other = await setupTenant(ctx, 'Other Academy');
    // Not a member there (URL-scoped route, no organization header).
    await ctx
      .http()
      .get(`/organizations/${other.orgId}/context`)
      .auth(cashier.user.accessToken, { type: 'bearer' })
      .expect(403);
  });

  it('updates and validates branding', async () => {
    const res = await t.as
      .patch(`/organizations/${t.orgId}`)
      .send({ primaryColor: '#38b266', secondaryColor: '#0ea5e9', language: 'ru' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      primaryColor: '#38B266',
      secondaryColor: '#0EA5E9',
      language: 'ru',
    });
    await t.as.patch(`/organizations/${t.orgId}`).send({ primaryColor: 'green' }).expect(422);
    await t.as.patch(`/organizations/${t.orgId}`).send({ language: 'de' }).expect(422);

    const me = await t.as.get('/auth/me').expect(200);
    expect(me.body.data.organizations[0]).toMatchObject({ primaryColor: '#38B266' });
  });
});

import { createOrganization, registerUser, type TestUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Organizations (e2e)', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    owner = await registerUser(ctx, 'Owner');
    stranger = await registerUser(ctx, 'Stranger');
  });
  afterAll(() => ctx.app.close());

  it('creates an organization and makes the creator DIRECTOR with access to all branches', async () => {
    const res = await ctx
      .http()
      .post('/organizations')
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ name: 'Jony Math Academy', phone: '+998901112233' })
      .expect(201);

    expect(res.body.data).toMatchObject({
      name: 'Jony Math Academy',
      slug: 'jony-math-academy',
      ownerId: owner.id,
      timezone: 'Asia/Tashkent',
      currency: 'UZS',
    });

    const membership = await ctx.prisma.organizationMembership.findFirstOrThrow({
      where: { userId: owner.id, organizationId: res.body.data.id },
      include: { role: true },
    });
    expect(membership.role.key).toBe('DIRECTOR');
    expect(membership.allBranches).toBe(true);
  });

  it('generates a unique slug when the name is reused, but rejects a taken explicit slug', async () => {
    const first = await createOrganization(ctx, owner, 'Jony Kids English');
    const second = await createOrganization(ctx, stranger, 'Jony Kids English');
    expect(second.slug).not.toBe(first.slug);
    expect(second.slug.startsWith('jony-kids-english-')).toBe(true);

    const res = await ctx
      .http()
      .post('/organizations')
      .auth(stranger.accessToken, { type: 'bearer' })
      .send({ name: 'Copycat', slug: first.slug })
      .expect(409);
    expect(res.body.code).toBe('ORGANIZATION_SLUG_TAKEN');
  });

  it('organization selector lists only organizations the user belongs to', async () => {
    const a = await createOrganization(ctx, owner, 'Jony Math Academy');
    const b = await createOrganization(ctx, owner, 'Jony Kids English');
    await createOrganization(ctx, stranger, 'Other Center');

    const res = await ctx
      .http()
      .get('/organizations')
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    expect((res.body.data as { id: string }[]).map((o) => o.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect(res.body.data[0].membership.role.key).toBe('DIRECTOR');
  });

  it('owner sees their organization with full permissions', async () => {
    const org = await createOrganization(ctx, owner);
    const res = await ctx
      .http()
      .get(`/organizations/${org.id}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    expect(res.body.data.membership.role).toBe('DIRECTOR');
    expect(res.body.data.membership.permissions).toEqual(
      expect.arrayContaining(['organization.read', 'organization.update', 'branch.create']),
    );

    await ctx
      .http()
      .patch(`/organizations/${org.id}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ address: 'Termiz, Alpomish 1' })
      .expect(200);
  });

  describe('tenant isolation', () => {
    it('forbids reading another organization (IDOR) with 403', async () => {
      const org = await createOrganization(ctx, owner);
      const res = await ctx
        .http()
        .get(`/organizations/${org.id}`)
        .auth(stranger.accessToken, { type: 'bearer' })
        .expect(403);
      expect(res.body).toMatchObject({ success: false, code: 'ORGANIZATION_ACCESS_DENIED' });
    });

    it('forbids updating another organization and leaves it unchanged', async () => {
      const org = await createOrganization(ctx, owner);
      await ctx
        .http()
        .patch(`/organizations/${org.id}`)
        .auth(stranger.accessToken, { type: 'bearer' })
        .send({ name: 'Hacked' })
        .expect(403);
      const stored = await ctx.prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
      expect(stored.name).toBe('Jony Math Academy');
    });

    it('returns the same 403 for non-existent organizations (no existence leak)', async () => {
      const res = await ctx
        .http()
        .get('/organizations/0190a4b8-0000-7000-8000-000000000000')
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(403);
      expect(res.body.code).toBe('ORGANIZATION_ACCESS_DENIED');
    });

    it('rejects a header that contradicts the URL', async () => {
      const mine = await createOrganization(ctx, owner, 'Mine');
      const theirs = await createOrganization(ctx, stranger, 'Theirs');
      const res = await ctx
        .http()
        .get(`/organizations/${mine.id}`)
        .set('X-Organization-Id', theirs.id)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(400);
      expect(res.body.code).toBe('ORGANIZATION_CONTEXT_MISMATCH');
    });
  });
});

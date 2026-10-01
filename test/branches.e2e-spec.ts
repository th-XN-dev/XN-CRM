import {
  addMember,
  createBranch,
  createOrganization,
  registerUser,
  type TestUser,
} from './utils/factories';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Branches (e2e)', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let stranger: TestUser;
  let orgId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    owner = await registerUser(ctx, 'Owner');
    stranger = await registerUser(ctx, 'Stranger');
    orgId = (await createOrganization(ctx, owner)).id;
  });
  afterAll(() => ctx.app.close());

  it('owner creates branches; code is normalized and unique per organization', async () => {
    const branch = await createBranch(ctx, owner, orgId, 'trm');
    expect(branch).toMatchObject({ organizationId: orgId, code: 'TRM' });

    const dup = await ctx
      .http()
      .post(`/organizations/${orgId}/branches`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ name: 'Termiz 2', code: 'TRM' })
      .expect(409);
    expect(dup.body.code).toBe('BRANCH_CODE_TAKEN');

    // The same code is fine in a different organization.
    const otherOrg = await createOrganization(ctx, stranger, 'Other');
    await createBranch(ctx, stranger, otherOrg.id, 'TRM');
  });

  it('branch selector lists the branches of the organization', async () => {
    await createBranch(ctx, owner, orgId, 'TRM');
    await createBranch(ctx, owner, orgId, 'DNV');
    const res = await ctx
      .http()
      .get(`/organizations/${orgId}/branches`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    expect((res.body.data as { code: string }[]).map((b) => b.code).sort()).toEqual(['DNV', 'TRM']);
  });

  it('GET/PATCH /branches/:id work within the X-Organization-Id context', async () => {
    const branch = await createBranch(ctx, owner, orgId);
    await ctx
      .http()
      .get(`/branches/${branch.id}`)
      .set('X-Organization-Id', orgId)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
    const res = await ctx
      .http()
      .patch(`/branches/${branch.id}`)
      .set('X-Organization-Id', orgId)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ name: 'Termiz markaziy', isActive: false })
      .expect(200);
    expect(res.body.data).toMatchObject({ name: 'Termiz markaziy', isActive: false });
  });

  describe('access control', () => {
    it('a non-member cannot create or list branches of another organization', async () => {
      const create = await ctx
        .http()
        .post(`/organizations/${orgId}/branches`)
        .auth(stranger.accessToken, { type: 'bearer' })
        .send({ name: 'Evil', code: 'EVL' })
        .expect(403);
      expect(create.body.code).toBe('ORGANIZATION_ACCESS_DENIED');

      await ctx
        .http()
        .get(`/organizations/${orgId}/branches`)
        .auth(stranger.accessToken, { type: 'bearer' })
        .expect(403);
      expect(await ctx.prisma.branch.count({ where: { organizationId: orgId } })).toBe(0);
    });

    it("a branch of another organization is not reachable through the caller's own organization", async () => {
      const foreignBranch = await createBranch(ctx, owner, orgId);
      const strangerOrg = await createOrganization(ctx, stranger, 'Other');

      // Own org in the header, foreign branch id in the URL → not found in this tenant.
      const res = await ctx
        .http()
        .get(`/branches/${foreignBranch.id}`)
        .set('X-Organization-Id', strangerOrg.id)
        .auth(stranger.accessToken, { type: 'bearer' })
        .expect(404);
      expect(res.body.code).toBe('BRANCH_NOT_FOUND');

      // Foreign org in the header → membership check fails.
      await ctx
        .http()
        .patch(`/branches/${foreignBranch.id}`)
        .set('X-Organization-Id', orgId)
        .auth(stranger.accessToken, { type: 'bearer' })
        .send({ name: 'Hacked' })
        .expect(403);
    });

    it('requires X-Organization-Id on /branches/:id', async () => {
      const branch = await createBranch(ctx, owner, orgId);
      const res = await ctx
        .http()
        .get(`/branches/${branch.id}`)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(400);
      expect(res.body.code).toBe('ORGANIZATION_CONTEXT_REQUIRED');
    });

    it('rejects an X-Branch-Id that belongs to another organization', async () => {
      const strangerOrg = await createOrganization(ctx, stranger, 'Other');
      const strangerBranch = await createBranch(ctx, stranger, strangerOrg.id, 'OTH');
      const res = await ctx
        .http()
        .get(`/organizations/${orgId}/branches`)
        .set('X-Branch-Id', strangerBranch.id)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(403);
      expect(res.body.code).toBe('BRANCH_ACCESS_DENIED');
    });

    it('a TEACHER cannot create branches and only sees assigned branches', async () => {
      const termiz = await createBranch(ctx, owner, orgId, 'TRM');
      const denov = await createBranch(ctx, owner, orgId, 'DNV');
      const teacher = await registerUser(ctx, 'Teacher');
      await addMember(ctx, teacher.id, orgId, 'TEACHER', [termiz.id]);
      const auth = { type: 'bearer' } as const;

      const create = await ctx
        .http()
        .post(`/organizations/${orgId}/branches`)
        .auth(teacher.accessToken, auth)
        .send({ name: 'Sherobod', code: 'SHR' })
        .expect(403);
      expect(create.body.code).toBe('PERMISSION_DENIED');

      const list = await ctx
        .http()
        .get(`/organizations/${orgId}/branches`)
        .auth(teacher.accessToken, auth)
        .expect(200);
      expect((list.body.data as { id: string }[]).map((b) => b.id)).toEqual([termiz.id]);

      const denied = await ctx
        .http()
        .get(`/branches/${denov.id}`)
        .set('X-Organization-Id', orgId)
        .auth(teacher.accessToken, auth)
        .expect(403);
      expect(denied.body.code).toBe('BRANCH_ACCESS_DENIED');

      await ctx
        .http()
        .get(`/organizations/${orgId}/branches`)
        .set('X-Branch-Id', denov.id)
        .auth(teacher.accessToken, auth)
        .expect(403);
    });
  });
});

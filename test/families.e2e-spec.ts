import {
  api,
  createFamily,
  createStudent,
  memberOf,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Families (e2e)', () => {
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

  it('creates a family; primary branch defaults to X-Branch-Id', async () => {
    const res = await api(ctx, t.owner, t.orgId, t.termiz.id)
      .post('/families')
      .send({ name: 'Karimovlar oilasi', phone: '+998 90 123-45-67', email: 'Karimov@Mail.uz' })
      .expect(201);
    expect(res.body.data).toMatchObject({
      organizationId: t.orgId,
      primaryBranchId: t.termiz.id,
      phone: '+998901234567',
      email: 'karimov@mail.uz',
      isActive: true,
    });
  });

  it('GET /families/:id returns { family, students }', async () => {
    const family = await createFamily(t.as, t.termiz.id);
    await createStudent(t.as, family.id, t.termiz.id, 'Ali');
    await createStudent(t.as, family.id, t.denov.id, 'Madina');

    const res = await t.as.get(`/families/${family.id}`).expect(200);
    expect(res.body.data.family).toMatchObject({ id: family.id, name: 'Karimovlar oilasi' });
    expect(
      (res.body.data.students as { firstName: string }[]).map((s) => s.firstName).sort(),
    ).toEqual(['Ali', 'Madina']);

    const list = await t.as.get(`/families/${family.id}/students`).expect(200);
    expect(list.body.data.meta.total).toBe(2);
  });

  it('updates a family', async () => {
    const family = await createFamily(t.as, t.termiz.id);
    const res = await t.as
      .patch(`/families/${family.id}`)
      .send({ address: 'Termiz, Alpomish 5', secondaryPhone: '+998911112233' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      address: 'Termiz, Alpomish 5',
      secondaryPhone: '+998911112233',
    });
  });

  it('searches with pagination in the standard envelope', async () => {
    await createFamily(t.as, t.termiz.id, 'Karimovlar oilasi');
    await createFamily(t.as, t.termiz.id, 'Rahimovlar oilasi');
    const res = await t.as.get('/families?search=karimov&page=1&limit=10').expect(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        items: [expect.objectContaining({ name: 'Karimovlar oilasi', studentsCount: 0 })],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });
  });

  it('DELETE deactivates, but only when no active/frozen students remain', async () => {
    const family = await createFamily(t.as, t.termiz.id);
    const student = await createStudent(t.as, family.id, t.termiz.id);

    const blocked = await t.as.delete(`/families/${family.id}`).expect(409);
    expect(blocked.body.code).toBe('FAMILY_HAS_ACTIVE_STUDENTS');

    await t.as.patch(`/students/${student.id}`).send({ status: 'LEFT' }).expect(200);
    const res = await t.as.delete(`/families/${family.id}`).expect(200);
    expect(res.body.data.isActive).toBe(false);
    expect(await ctx.prisma.family.count({ where: { id: family.id } })).toBe(1);
  });

  describe('access control', () => {
    it('another organization cannot read or update the family', async () => {
      const family = await createFamily(t.as, t.termiz.id);
      const other = await setupTenant(ctx, 'Other Center');

      // Own organization in the header → the foreign family simply doesn't exist there.
      const res = await other.as.get(`/families/${family.id}`).expect(404);
      expect(res.body.code).toBe('FAMILY_NOT_FOUND');
      await other.as.patch(`/families/${family.id}`).send({ name: 'Hacked' }).expect(404);

      // Foreign organization in the header → no membership.
      const denied = await api(ctx, other.owner, t.orgId).get(`/families/${family.id}`).expect(403);
      expect(denied.body.code).toBe('ORGANIZATION_ACCESS_DENIED');
      const stored = await ctx.prisma.family.findUniqueOrThrow({ where: { id: family.id } });
      expect(stored.name).toBe('Karimovlar oilasi');
    });

    it('a branch-restricted member only sees families of their branch', async () => {
      const termizFamily = await createFamily(t.as, t.termiz.id, 'Termiz oilasi');
      const denovFamily = await createFamily(t.as, t.denov.id, 'Denov oilasi');
      const manager = await memberOf(ctx, t, 'MANAGER', [t.termiz.id]);

      const list = await manager.as.get('/families').expect(200);
      expect((list.body.data.items as { id: string }[]).map((f) => f.id)).toEqual([
        termizFamily.id,
      ]);

      const res = await manager.as.get(`/families/${denovFamily.id}`).expect(403);
      expect(res.body.code).toBe('BRANCH_ACCESS_DENIED');

      const create = await manager.as
        .post('/families')
        .send({ name: 'X', phone: '+998901234567', primaryBranchId: t.denov.id })
        .expect(403);
      expect(create.body.code).toBe('BRANCH_ACCESS_DENIED');
    });

    it('a TEACHER cannot read families (no families.read)', async () => {
      const teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      const res = await teacher.as.get('/families').expect(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });
  });
});

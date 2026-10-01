import {
  createCourse,
  createFamily,
  createGroup,
  createStudent,
  enroll,
  memberOf,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Students (e2e)', () => {
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

  it('creates a student in an existing family', async () => {
    const family = await createFamily(t.as, t.termiz.id);
    const res = await t.as
      .post('/students')
      .send({
        familyId: family.id,
        firstName: 'Ali',
        lastName: 'Karimov',
        birthDate: '2014-05-17',
        gender: 'MALE',
        joinedAt: '2026-09-01',
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      familyId: family.id,
      branchId: t.termiz.id, // inherited from the family's primary branch
      status: 'ACTIVE',
      birthDate: '2014-05-17T00:00:00.000Z',
      joinedAt: '2026-09-01T00:00:00.000Z',
    });
  });

  it('creates family + student atomically (student-family relation)', async () => {
    const res = await t.as
      .post('/students')
      .send({
        family: { name: 'Karimovlar oilasi', phone: '+998901234567' },
        branchId: t.termiz.id,
        firstName: 'Vali',
        lastName: 'Karimov',
      })
      .expect(201);
    const family = await ctx.prisma.family.findUniqueOrThrow({
      where: { id: res.body.data.familyId },
    });
    expect(family).toMatchObject({ organizationId: t.orgId, primaryBranchId: t.termiz.id });

    const detail = await t.as.get(`/students/${res.body.data.id}`).expect(200);
    expect(detail.body.data).toMatchObject({
      family: { id: family.id, name: 'Karimovlar oilasi' },
      branch: { id: t.termiz.id },
      activeEnrollment: null,
    });
  });

  it('persists nothing when the family+student request is rejected', async () => {
    await t.as
      .post('/students')
      .send({
        family: { name: 'Ghost', phone: '+998901234567' },
        branchId: t.termiz.id,
        firstName: 'X',
      })
      .expect(422);
    // Unknown branch → rejected before anything is written.
    await t.as
      .post('/students')
      .send({
        family: { name: 'Ghost', phone: '+998901234567' },
        branchId: '0190a4b8-0000-7000-8000-000000000000',
        firstName: 'X',
        lastName: 'Y',
      })
      .expect(404);
    expect(await ctx.prisma.family.count({ where: { name: 'Ghost' } })).toBe(0);
  });

  it('requires exactly one of familyId / family', async () => {
    const family = await createFamily(t.as, t.termiz.id);
    await t.as
      .post('/students')
      .send({ firstName: 'A', lastName: 'B', branchId: t.termiz.id })
      .expect(422);
    const both = await t.as
      .post('/students')
      .send({
        familyId: family.id,
        family: { name: 'X', phone: '+998901234567' },
        firstName: 'A',
        lastName: 'B',
      })
      .expect(400);
    expect(both.body.code).toBe('VALIDATION_ERROR');
  });

  it('updates a student', async () => {
    const family = await createFamily(t.as, t.termiz.id);
    const student = await createStudent(t.as, family.id, t.termiz.id);
    const res = await t.as
      .patch(`/students/${student.id}`)
      .send({
        middleName: 'Anvarovich',
        phone: '+998931234567',
        notes: 'Olimpiadaga tayyorlanmoqda',
      })
      .expect(200);
    expect(res.body.data).toMatchObject({ middleName: 'Anvarovich', phone: '+998931234567' });
  });

  describe('status changes', () => {
    it('FROZEN keeps the seat; LEFT closes the active enrollment as CANCELLED', async () => {
      const family = await createFamily(t.as, t.termiz.id);
      const student = await createStudent(t.as, family.id, t.termiz.id);
      const course = await createCourse(t.as);
      const group = await createGroup(t.as, { branchId: t.termiz.id, courseId: course.id });
      const enrollment = (await enroll(t.as, student.id, group.id).expect(201)).body.data;

      await t.as.patch(`/students/${student.id}`).send({ status: 'FROZEN' }).expect(200);
      expect(
        (await ctx.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status,
      ).toBe('ACTIVE');

      const left = await t.as.delete(`/students/${student.id}`).expect(200);
      expect(left.body.data.status).toBe('LEFT');
      expect(left.body.data.leftAt).not.toBeNull();
      const closed = await ctx.prisma.enrollment.findUniqueOrThrow({
        where: { id: enrollment.id },
      });
      expect(closed.status).toBe('CANCELLED');
      expect(closed.endedAt).not.toBeNull();

      // A returning student becomes ACTIVE again; history stays.
      const back = await t.as
        .patch(`/students/${student.id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(back.body.data.leftAt).toBeNull();
      expect(await ctx.prisma.enrollment.count({ where: { studentId: student.id } })).toBe(1);
    });

    it('rejects invalid transitions', async () => {
      const family = await createFamily(t.as, t.termiz.id);
      const student = await createStudent(t.as, family.id, t.termiz.id);
      await t.as.patch(`/students/${student.id}`).send({ status: 'GRADUATED' }).expect(200);
      const res = await t.as
        .patch(`/students/${student.id}`)
        .send({ status: 'FROZEN' })
        .expect(400);
      expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  it('lists with search, status filter and pagination', async () => {
    const family = await createFamily(t.as, t.termiz.id);
    await createStudent(t.as, family.id, t.termiz.id, 'Ali');
    const vali = await createStudent(t.as, family.id, t.termiz.id, 'Vali');
    await t.as.patch(`/students/${vali.id}`).send({ status: 'FROZEN' }).expect(200);

    const res = await t.as
      .get('/students?search=ali karimov&status=ACTIVE&page=1&limit=20')
      .expect(200);
    expect(res.body.data.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(res.body.data.items[0]).toMatchObject({ firstName: 'Ali', family: { id: family.id } });

    const byFamilyPhone = await t.as.get('/students?search=90123').expect(200);
    expect(byFamilyPhone.body.data.meta.total).toBe(2);
  });

  describe('organization and branch isolation', () => {
    it('students and families of another organization are invisible', async () => {
      const family = await createFamily(t.as, t.termiz.id);
      const student = await createStudent(t.as, family.id, t.termiz.id);
      const other = await setupTenant(ctx, 'Other Center');

      const res = await other.as.get(`/students/${student.id}`).expect(404);
      expect(res.body.code).toBe('STUDENT_NOT_FOUND');
      await other.as.patch(`/students/${student.id}`).send({ firstName: 'Hacked' }).expect(404);
      expect((await other.as.get('/students').expect(200)).body.data.meta.total).toBe(0);

      // Can't attach a student to a family of another organization.
      const attach = await other.as
        .post('/students')
        .send({ familyId: family.id, branchId: other.termiz.id, firstName: 'X', lastName: 'Y' })
        .expect(404);
      expect(attach.body.code).toBe('FAMILY_NOT_FOUND');
    });

    it('a branch-restricted member sees only students of their branch', async () => {
      const family = await createFamily(t.as, t.termiz.id);
      const ali = await createStudent(t.as, family.id, t.termiz.id, 'Ali');
      const madina = await createStudent(t.as, family.id, t.denov.id, 'Madina');
      // CASHIER: branch-wide students.read, no students.update.
      const cashier = await memberOf(ctx, t, 'CASHIER', [t.termiz.id]);

      const list = await cashier.as.get('/students').expect(200);
      expect((list.body.data.items as { id: string }[]).map((s) => s.id)).toEqual([ali.id]);
      const denied = await cashier.as.get(`/students/${madina.id}`).expect(403);
      expect(denied.body.code).toBe('BRANCH_ACCESS_DENIED');
      await cashier.as.get(`/students?branchId=${t.denov.id}`).expect(403);
      await cashier.as.patch(`/students/${ali.id}`).send({ firstName: 'X' }).expect(403);
    });
  });
});

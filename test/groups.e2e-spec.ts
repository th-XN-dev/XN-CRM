import {
  createCourse,
  createFamily,
  createGroup,
  createLevel,
  createStudent,
  enroll,
  memberOf,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Groups (e2e)', () => {
  let ctx: TestContext;
  let t: Tenant;
  let courseId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    t = await setupTenant(ctx);
    courseId = (await createCourse(t.as, 'MATH')).id;
  });
  afterAll(() => ctx.app.close());

  it('creates a group; price defaults to the course price', async () => {
    const level = await createLevel(t.as, courseId);
    const res = await t.as
      .post('/groups')
      .send({
        branchId: t.termiz.id,
        courseId,
        levelId: level.id,
        name: 'Math F1',
        capacity: 12,
        startDate: '2026-10-01',
        endDate: '2027-05-31',
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      organizationId: t.orgId,
      branchId: t.termiz.id,
      monthlyPrice: '450000',
      status: 'ACTIVE',
      enrolledCount: 0,
      course: { id: courseId, code: 'MATH' },
      level: { id: level.id },
      teacherId: null,
      roomId: null,
    });
  });

  it('rejects a level that belongs to another course', async () => {
    const english = await createCourse(t.as, 'ENG');
    const englishLevel = await createLevel(t.as, english.id);
    const res = await t.as
      .post('/groups')
      .send({
        branchId: t.termiz.id,
        courseId,
        levelId: englishLevel.id,
        name: 'X',
        capacity: 5,
        startDate: '2026-10-01',
      })
      .expect(400);
    expect(res.body.code).toBe('LEVEL_COURSE_MISMATCH');

    const group = await createGroup(t.as, { branchId: t.termiz.id, courseId });
    const patch = await t.as
      .patch(`/groups/${group.id}`)
      .send({ levelId: englishLevel.id })
      .expect(400);
    expect(patch.body.code).toBe('LEVEL_COURSE_MISMATCH');
  });

  it('rejects courses of another organization and invalid dates', async () => {
    const other = await setupTenant(ctx, 'Other');
    const foreignCourse = await createCourse(other.as, 'MATH');
    const res = await t.as
      .post('/groups')
      .send({
        branchId: t.termiz.id,
        courseId: foreignCourse.id,
        name: 'X',
        capacity: 5,
        startDate: '2026-10-01',
      })
      .expect(404);
    expect(res.body.code).toBe('COURSE_NOT_FOUND');

    const dates = await t.as
      .post('/groups')
      .send({
        branchId: t.termiz.id,
        courseId,
        name: 'X',
        capacity: 5,
        startDate: '2026-10-01',
        endDate: '2026-09-01',
      })
      .expect(400);
    expect(dates.body.code).toBe('INVALID_DATE_RANGE');
  });

  it('capacity validation: full group → 409 GROUP_CAPACITY_FULL; capacity cannot drop below enrolled', async () => {
    const group = await createGroup(t.as, { branchId: t.termiz.id, courseId, capacity: 2 });
    const family = await createFamily(t.as, t.termiz.id);
    for (const name of ['Ali', 'Vali']) {
      const student = await createStudent(t.as, family.id, t.termiz.id, name);
      await enroll(t.as, student.id, group.id).expect(201);
    }
    const third = await createStudent(t.as, family.id, t.termiz.id, 'Madina');
    const res = await enroll(t.as, third.id, group.id).expect(409);
    expect(res.body).toEqual({
      success: false,
      message: 'Group capacity is full',
      code: 'GROUP_CAPACITY_FULL',
    });

    const shrink = await t.as.patch(`/groups/${group.id}`).send({ capacity: 1 }).expect(409);
    expect(shrink.body.code).toBe('GROUP_CAPACITY_BELOW_ENROLLED');
    const detail = await t.as.get(`/groups/${group.id}`).expect(200);
    expect(detail.body.data).toMatchObject({ capacity: 2, enrolledCount: 2 });

    expect((await t.as.delete(`/groups/${group.id}`).expect(409)).body.code).toBe(
      'GROUP_HAS_ACTIVE_ENROLLMENTS',
    );
  });

  it('filters by courseId/branchId and respects branch access', async () => {
    const english = await createCourse(t.as, 'ENG');
    const mathTermiz = await createGroup(t.as, {
      branchId: t.termiz.id,
      courseId,
      name: 'Math TRM',
    });
    await createGroup(t.as, { branchId: t.denov.id, courseId, name: 'Math DNV' });
    await createGroup(t.as, { branchId: t.termiz.id, courseId: english.id, name: 'Eng TRM' });

    const res = await t.as.get(`/groups?courseId=${courseId}&branchId=${t.termiz.id}`).expect(200);
    expect((res.body.data.items as { id: string }[]).map((g) => g.id)).toEqual([mathTermiz.id]);

    const manager = await memberOf(ctx, t, 'MANAGER', [t.denov.id]);
    const visible = await manager.as.get('/groups').expect(200);
    expect((visible.body.data.items as { name: string }[]).map((g) => g.name)).toEqual([
      'Math DNV',
    ]);
    const denied = await manager.as.get(`/groups/${mathTermiz.id}`).expect(403);
    expect(denied.body.code).toBe('BRANCH_ACCESS_DENIED');
    await manager.as
      .post('/groups')
      .send({ branchId: t.termiz.id, courseId, name: 'X', capacity: 5, startDate: '2026-10-01' })
      .expect(403);
  });
});

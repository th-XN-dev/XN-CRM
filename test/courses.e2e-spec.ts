import {
  createCourse,
  createGroup,
  createLevel,
  memberOf,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Courses & Levels (e2e)', () => {
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

  it('creates a course; code is upper-cased and unique per organization', async () => {
    const res = await t.as
      .post('/courses')
      .send({ name: 'Mathematics', code: 'math', monthlyPrice: 450000, description: 'Core math' })
      .expect(201);
    expect(res.body.data).toMatchObject({ code: 'MATH', monthlyPrice: '450000', isActive: true });

    const dup = await t.as
      .post('/courses')
      .send({ name: 'Math 2', code: 'MATH', monthlyPrice: 1 })
      .expect(409);
    expect(dup.body.code).toBe('COURSE_CODE_TAKEN');

    const other = await setupTenant(ctx, 'Other');
    await other.as
      .post('/courses')
      .send({ name: 'Math', code: 'MATH', monthlyPrice: 1 })
      .expect(201);
  });

  it('creates ordered levels and returns them with the course', async () => {
    const course = await createCourse(t.as, 'MATH');
    await t.as
      .post(`/courses/${course.id}/levels`)
      .send({ name: 'Senior', code: 'S', order: 3 })
      .expect(201);
    await t.as
      .post(`/courses/${course.id}/levels`)
      .send({ name: 'Foundation', code: 'F', order: 1 })
      .expect(201);
    const dup = await t.as
      .post(`/courses/${course.id}/levels`)
      .send({ name: 'Again', code: 'f' })
      .expect(409);
    expect(dup.body.code).toBe('LEVEL_CODE_TAKEN');

    const levels = await t.as.get(`/courses/${course.id}/levels`).expect(200);
    expect((levels.body.data.items as { code: string }[]).map((l) => l.code)).toEqual(['F', 'S']);
    const detail = await t.as.get(`/courses/${course.id}`).expect(200);
    expect(detail.body.data.levels).toHaveLength(2);
  });

  it('level codes are unique per course, not globally', async () => {
    const math = await createCourse(t.as, 'MATH');
    const english = await createCourse(t.as, 'ENG');
    await createLevel(t.as, math.id, 'F1');
    await createLevel(t.as, english.id, 'F1');
  });

  it('levels of another organization are not reachable (invalid course-level relation)', async () => {
    const course = await createCourse(t.as);
    const level = await createLevel(t.as, course.id);
    const other = await setupTenant(ctx, 'Other');

    const res = await other.as.patch(`/levels/${level.id}`).send({ name: 'Hacked' }).expect(404);
    expect(res.body.code).toBe('LEVEL_NOT_FOUND');
    await other.as.post(`/courses/${course.id}/levels`).send({ name: 'X', code: 'X' }).expect(404);
    await other.as.get(`/courses/${course.id}/levels`).expect(404);
  });

  it('deactivation is blocked while groups still run', async () => {
    const course = await createCourse(t.as);
    const level = await createLevel(t.as, course.id);
    const group = await createGroup(t.as, {
      branchId: t.termiz.id,
      courseId: course.id,
      levelId: level.id,
    });

    expect((await t.as.delete(`/courses/${course.id}`).expect(409)).body.code).toBe(
      'COURSE_HAS_ACTIVE_GROUPS',
    );
    expect((await t.as.delete(`/levels/${level.id}`).expect(409)).body.code).toBe(
      'LEVEL_HAS_ACTIVE_GROUPS',
    );

    await t.as.delete(`/groups/${group.id}`).expect(200);
    expect((await t.as.delete(`/levels/${level.id}`).expect(200)).body.data.isActive).toBe(false);
    expect((await t.as.delete(`/courses/${course.id}`).expect(200)).body.data.isActive).toBe(false);

    const inactive = await t.as
      .post(`/courses/${course.id}/levels`)
      .send({ name: 'X', code: 'X' })
      .expect(409);
    expect(inactive.body.code).toBe('COURSE_INACTIVE');
  });

  it('a TEACHER can read but not create courses', async () => {
    await createCourse(t.as);
    const teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
    expect((await teacher.as.get('/courses').expect(200)).body.data.meta.total).toBe(1);
    await teacher.as.post('/courses').send({ name: 'X', code: 'X', monthlyPrice: 1 }).expect(403);
  });
});

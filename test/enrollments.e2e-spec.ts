import {
  api,
  createCourse,
  createFamily,
  createGroup,
  createStudent,
  enroll,
  memberOf,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type DomainEvent } from '../src/common/events/domain-events';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Enrollments (e2e)', () => {
  let ctx: TestContext;
  let t: Tenant;
  let familyId: string;
  let courseId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    t = await setupTenant(ctx);
    familyId = (await createFamily(t.as, t.termiz.id)).id;
    courseId = (await createCourse(t.as, 'MATH')).id;
  });
  afterAll(() => ctx.app.close());

  it('enrolls a student into a group', async () => {
    const student = await createStudent(t.as, familyId, t.termiz.id);
    const group = await createGroup(t.as, { branchId: t.termiz.id, courseId });
    const res = await enroll(t.as, student.id, group.id, '2026-01-15').expect(201);
    expect(res.body.data).toMatchObject({
      organizationId: t.orgId,
      branchId: t.termiz.id,
      studentId: student.id,
      groupId: group.id,
      status: 'ACTIVE',
      startedAt: '2026-01-15T00:00:00.000Z',
      endedAt: null,
      student: { id: student.id },
      group: { id: group.id, course: { id: courseId } },
    });
    const detail = await t.as.get(`/students/${student.id}`).expect(200);
    expect(detail.body.data.activeEnrollment).toMatchObject({ id: res.body.data.id });
  });

  it('rejects a second ACTIVE enrollment for the same student', async () => {
    const student = await createStudent(t.as, familyId, t.termiz.id);
    const a = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'A' });
    const b = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'B' });
    await enroll(t.as, student.id, a.id).expect(201);
    const res = await enroll(t.as, student.id, b.id).expect(409);
    expect(res.body.code).toBe('STUDENT_ALREADY_ENROLLED');
  });

  it('rejects enrollment of non-active students and into non-active groups', async () => {
    const student = await createStudent(t.as, familyId, t.termiz.id);
    const group = await createGroup(t.as, { branchId: t.termiz.id, courseId });
    await t.as.patch(`/students/${student.id}`).send({ status: 'FROZEN' }).expect(200);
    expect((await enroll(t.as, student.id, group.id).expect(409)).body.code).toBe(
      'STUDENT_NOT_ACTIVE',
    );

    await t.as.patch(`/students/${student.id}`).send({ status: 'ACTIVE' }).expect(200);
    await t.as.patch(`/groups/${group.id}`).send({ status: 'PAUSED' }).expect(200);
    expect((await enroll(t.as, student.id, group.id).expect(409)).body.code).toBe(
      'GROUP_NOT_ACTIVE',
    );
  });

  it('transfers a student: old enrollment TRANSFERRED, new one ACTIVE, history kept', async () => {
    const student = await createStudent(t.as, familyId, t.termiz.id);
    const groupA = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'Group A' });
    const groupB = await createGroup(t.as, { branchId: t.denov.id, courseId, name: 'Group B' });
    const first = (await enroll(t.as, student.id, groupA.id, '2026-01-10').expect(201)).body.data;
    const events: DomainEvent[] = [];
    ctx.app
      .get(EventEmitter2)
      .once('enrollment.transferred', (event: DomainEvent) => events.push(event));

    const res = await t.as
      .post(`/enrollments/${first.id}/transfer`)
      .send({ targetGroupId: groupB.id, transferDate: '2026-03-01', notes: 'Moved to Denov' })
      .expect(200);
    expect(res.body.data.previous).toMatchObject({
      id: first.id,
      status: 'TRANSFERRED',
      endedAt: '2026-03-01T00:00:00.000Z',
    });
    expect(res.body.data.current).toMatchObject({
      groupId: groupB.id,
      branchId: t.denov.id,
      status: 'ACTIVE',
      startedAt: '2026-03-01T00:00:00.000Z',
      transferredFromId: first.id,
    });

    // Audit-ready domain event, emitted after commit.
    expect(events).toEqual([
      expect.objectContaining({
        organizationId: t.orgId,
        actorUserId: t.owner.id,
        entityType: 'Enrollment',
        entityId: res.body.data.current.id,
        payload: expect.objectContaining({ fromGroupId: groupA.id, toGroupId: groupB.id }),
      }),
    ]);

    // The student's home branch follows the group.
    const detail = await t.as.get(`/students/${student.id}`).expect(200);
    expect(detail.body.data.branchId).toBe(t.denov.id);

    const history = await t.as.get(`/students/${student.id}/enrollments`).expect(200);
    expect((history.body.data.items as { status: string }[]).map((e) => e.status)).toEqual([
      'ACTIVE',
      'TRANSFERRED',
    ]);

    // Transferring the closed enrollment again is rejected.
    const again = await t.as
      .post(`/enrollments/${first.id}/transfer`)
      .send({ targetGroupId: groupA.id })
      .expect(409);
    expect(again.body.code).toBe('ENROLLMENT_NOT_ACTIVE');
  });

  it('transfer validates the target group (same group, capacity) and changes nothing on failure', async () => {
    const [ali, vali] = [
      await createStudent(t.as, familyId, t.termiz.id, 'Ali'),
      await createStudent(t.as, familyId, t.termiz.id, 'Vali'),
    ];
    const groupA = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'A' });
    const full = await createGroup(t.as, {
      branchId: t.termiz.id,
      courseId,
      name: 'Full',
      capacity: 1,
    });
    const enrollment = (await enroll(t.as, ali.id, groupA.id).expect(201)).body.data;
    await enroll(t.as, vali.id, full.id).expect(201);

    const same = await t.as
      .post(`/enrollments/${enrollment.id}/transfer`)
      .send({ targetGroupId: groupA.id })
      .expect(400);
    expect(same.body.code).toBe('TRANSFER_SAME_GROUP');
    const res = await t.as
      .post(`/enrollments/${enrollment.id}/transfer`)
      .send({ targetGroupId: full.id })
      .expect(409);
    expect(res.body.code).toBe('GROUP_CAPACITY_FULL');

    const unchanged = await ctx.prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(unchanged).toMatchObject({ status: 'ACTIVE', endedAt: null });
    expect(await ctx.prisma.enrollment.count({ where: { studentId: ali.id } })).toBe(1);
  });

  it('cancels an enrollment and keeps it in history', async () => {
    const student = await createStudent(t.as, familyId, t.termiz.id);
    const group = await createGroup(t.as, { branchId: t.termiz.id, courseId });
    const enrollment = (await enroll(t.as, student.id, group.id, '2026-01-10').expect(201)).body
      .data;

    const res = await t.as
      .post(`/enrollments/${enrollment.id}/cancel`)
      .send({ endedAt: '2026-02-01', notes: 'Oila ko‘chib ketdi' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      status: 'CANCELLED',
      endedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(
      (await t.as.post(`/enrollments/${enrollment.id}/cancel`).send({}).expect(409)).body.code,
    ).toBe('ENROLLMENT_NOT_ACTIVE');
    // The seat is free again and the student can be re-enrolled.
    await enroll(t.as, student.id, group.id, '2026-03-01').expect(201);
    expect(await ctx.prisma.enrollment.count({ where: { studentId: student.id } })).toBe(2);
  });

  describe('isolation', () => {
    it('cross-organization enrollment attempts fail', async () => {
      const student = await createStudent(t.as, familyId, t.termiz.id);
      const group = await createGroup(t.as, { branchId: t.termiz.id, courseId });
      const other = await setupTenant(ctx, 'Other');
      const otherFamily = await createFamily(other.as, other.termiz.id);
      const otherStudent = await createStudent(other.as, otherFamily.id, other.termiz.id);
      const otherGroup = await createGroup(other.as, {
        branchId: other.termiz.id,
        courseId: (await createCourse(other.as, 'MATH')).id,
      });

      // Foreign student into my group / my student into a foreign group — both unknown in my tenant.
      expect((await enroll(t.as, otherStudent.id, group.id).expect(404)).body.code).toBe(
        'STUDENT_NOT_FOUND',
      );
      expect((await enroll(t.as, student.id, otherGroup.id).expect(404)).body.code).toBe(
        'GROUP_NOT_FOUND',
      );
      // Using the foreign organization header without membership.
      await enroll(api(ctx, t.owner, other.orgId), student.id, otherGroup.id).expect(403);
      expect(await ctx.prisma.enrollment.count()).toBe(0);
    });

    it('cross-branch: a member limited to Termiz cannot enroll into, read or transfer to Denov', async () => {
      const manager = await memberOf(ctx, t, 'MANAGER', [t.termiz.id]);
      const student = await createStudent(t.as, familyId, t.termiz.id);
      const termizGroup = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'TRM' });
      const denovGroup = await createGroup(t.as, { branchId: t.denov.id, courseId, name: 'DNV' });

      const denied = await enroll(manager.as, student.id, denovGroup.id).expect(403);
      expect(denied.body.code).toBe('BRANCH_ACCESS_DENIED');

      const enrollment = (await enroll(manager.as, student.id, termizGroup.id).expect(201)).body
        .data;
      await manager.as
        .post(`/enrollments/${enrollment.id}/transfer`)
        .send({ targetGroupId: denovGroup.id })
        .expect(403);

      const otherFamily = await createFamily(t.as, t.denov.id, 'Denov oilasi');
      const denovStudent = await createStudent(t.as, otherFamily.id, t.denov.id, 'Madina');
      const denovEnrollment = (await enroll(t.as, denovStudent.id, denovGroup.id).expect(201)).body
        .data;
      await manager.as.get(`/enrollments/${denovEnrollment.id}`).expect(403);
      const list = await manager.as.get('/enrollments').expect(200);
      expect((list.body.data.items as { id: string }[]).map((e) => e.id)).toEqual([enrollment.id]);
    });
  });

  describe('concurrency', () => {
    it('parallel enrollments never exceed capacity', async () => {
      const group = await createGroup(t.as, { branchId: t.termiz.id, courseId, capacity: 3 });
      const students = await Promise.all(
        Array.from({ length: 8 }, (_, i) => createStudent(t.as, familyId, t.termiz.id, `S${i}`)),
      );
      const results = await Promise.all(students.map((s) => enroll(t.as, s.id, group.id)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(3);
      expect(
        results.filter((r) => r.status === 409).every((r) => r.body.code === 'GROUP_CAPACITY_FULL'),
      ).toBe(true);
      expect(
        await ctx.prisma.enrollment.count({ where: { groupId: group.id, status: 'ACTIVE' } }),
      ).toBe(3);
    });

    it('parallel enrollments of one student create a single ACTIVE enrollment', async () => {
      const student = await createStudent(t.as, familyId, t.termiz.id);
      const groups = await Promise.all(
        ['A', 'B', 'C', 'D'].map((name) =>
          createGroup(t.as, { branchId: t.termiz.id, courseId, name }),
        ),
      );
      const results = await Promise.all(groups.map((g) => enroll(t.as, student.id, g.id)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(
        await ctx.prisma.enrollment.count({ where: { studentId: student.id, status: 'ACTIVE' } }),
      ).toBe(1);
    });
  });
});

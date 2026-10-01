import {
  addSchedule,
  createCourse,
  createGroup,
  createRoom,
  createTeacher,
  setupTenant,
  teacherWithLogin,
  type Tenant,
} from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Group assignment & Schedules (e2e)', () => {
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

  describe('group → teacher / room', () => {
    it('assigns teacher and room on creation and exposes them', async () => {
      const teacher = await createTeacher(t.as, t.termiz.id);
      const room = await createRoom(t.as, t.termiz.id);
      const res = await t.as
        .post('/groups')
        .send({
          branchId: t.termiz.id,
          courseId,
          name: 'Math A',
          capacity: 12,
          startDate: '2026-09-01',
          teacherId: teacher.id,
          roomId: room.id,
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        teacherId: teacher.id,
        roomId: room.id,
        teacher: { id: teacher.id, firstName: 'Dilnoza' },
        room: { id: room.id, code: '101' },
      });
    });

    it('rejects a teacher of another organization and a room of another branch', async () => {
      const other = await setupTenant(ctx, 'Other');
      const foreignTeacher = await createTeacher(other.as, other.termiz.id);
      const denovRoom = await createRoom(t.as, t.denov.id);
      const group = await createGroup(t.as, { branchId: t.termiz.id, courseId });

      const teacherRes = await t.as
        .patch(`/groups/${group.id}`)
        .send({ teacherId: foreignTeacher.id })
        .expect(404);
      expect(teacherRes.body.code).toBe('TEACHER_NOT_FOUND');
      const roomRes = await t.as
        .patch(`/groups/${group.id}`)
        .send({ roomId: denovRoom.id })
        .expect(400);
      expect(roomRes.body.code).toBe('ROOM_BRANCH_MISMATCH');

      const inactive = await createTeacher(t.as, t.termiz.id);
      await t.as.delete(`/teachers/${inactive.id}`).expect(200);
      expect(
        (await t.as.patch(`/groups/${group.id}`).send({ teacherId: inactive.id }).expect(409)).body
          .code,
      ).toBe('TEACHER_INACTIVE');
    });

    it('a teacher leading running groups cannot be deactivated', async () => {
      const teacher = await createTeacher(t.as, t.termiz.id);
      const group = await createGroup(t.as, { branchId: t.termiz.id, courseId });
      await t.as.patch(`/groups/${group.id}`).send({ teacherId: teacher.id }).expect(200);
      expect((await t.as.delete(`/teachers/${teacher.id}`).expect(409)).body.code).toBe(
        'TEACHER_HAS_ACTIVE_GROUPS',
      );
      await t.as.patch(`/groups/${group.id}`).send({ teacherId: null }).expect(200);
      await t.as.delete(`/teachers/${teacher.id}`).expect(200);
    });
  });

  describe('schedules', () => {
    it('creates a weekly schedule; room defaults to the group room; listed Monday → Sunday', async () => {
      const room = await createRoom(t.as, t.termiz.id);
      const group = await createGroup(t.as, { branchId: t.termiz.id, courseId });
      await t.as.patch(`/groups/${group.id}`).send({ roomId: room.id }).expect(200);

      const created = await addSchedule(t.as, group.id, { dayOfWeek: 'FRIDAY' }).expect(201);
      expect(created.body.data).toMatchObject({
        groupId: group.id,
        branchId: t.termiz.id,
        roomId: room.id,
        dayOfWeek: 'FRIDAY',
        startTime: '18:30',
        endTime: '20:00',
        isActive: true,
      });
      await addSchedule(t.as, group.id, { dayOfWeek: 'MONDAY' }).expect(201);
      await addSchedule(t.as, group.id, { dayOfWeek: 'WEDNESDAY' }).expect(201);

      const list = await t.as.get(`/groups/${group.id}/schedules`).expect(200);
      expect((list.body.data.items as { dayOfWeek: string }[]).map((s) => s.dayOfWeek)).toEqual([
        'MONDAY',
        'WEDNESDAY',
        'FRIDAY',
      ]);
    });

    it('rejects invalid times', async () => {
      const group = await createGroup(t.as, { branchId: t.termiz.id, courseId });
      expect(
        (await addSchedule(t.as, group.id, { startTime: '20:00', endTime: '18:30' }).expect(400))
          .body.code,
      ).toBe('INVALID_TIME_RANGE');
      expect(
        (await addSchedule(t.as, group.id, { startTime: '25:00' }).expect(422)).body.code,
      ).toBe('VALIDATION_ERROR');
    });

    it('room conflict: same room, same day, overlapping time → 409; touching slots are fine', async () => {
      const room = await createRoom(t.as, t.termiz.id);
      const a = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'A' });
      const b = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'B' });
      await addSchedule(t.as, a.id, { roomId: room.id }).expect(201);

      const clash = await addSchedule(t.as, b.id, {
        roomId: room.id,
        startTime: '19:00',
        endTime: '20:30',
      }).expect(409);
      expect(clash.body).toMatchObject({ success: false, code: 'ROOM_SCHEDULE_CONFLICT' });
      expect(clash.body.message).toContain('"A"');

      await addSchedule(t.as, b.id, {
        roomId: room.id,
        startTime: '20:00',
        endTime: '21:30',
      }).expect(201);
      await addSchedule(t.as, b.id, { roomId: room.id, dayOfWeek: 'TUESDAY' }).expect(201);
      // Same group twice at the same time.
      expect((await addSchedule(t.as, a.id, { roomId: null }).expect(409)).body.code).toBe(
        'GROUP_SCHEDULE_CONFLICT',
      );
    });

    it('teacher conflict: on schedule creation and on teacher reassignment', async () => {
      const teacher = await createTeacher(t.as, t.termiz.id);
      const a = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'A' });
      const b = await createGroup(t.as, { branchId: t.denov.id, courseId, name: 'B' });
      await t.as.patch(`/groups/${a.id}`).send({ teacherId: teacher.id }).expect(200);
      await t.as.patch(`/groups/${b.id}`).send({ teacherId: teacher.id }).expect(200);
      await addSchedule(t.as, a.id).expect(201);

      const clash = await addSchedule(t.as, b.id, { startTime: '19:30', endTime: '21:00' }).expect(
        409,
      );
      expect(clash.body.code).toBe('TEACHER_SCHEDULE_CONFLICT');

      // Group C has the same slot; giving it the busy teacher must fail too.
      const c = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'C' });
      await addSchedule(t.as, c.id).expect(201);
      const reassign = await t.as
        .patch(`/groups/${c.id}`)
        .send({ teacherId: teacher.id })
        .expect(409);
      expect(reassign.body.code).toBe('TEACHER_SCHEDULE_CONFLICT');
    });

    it('groups whose date periods do not overlap do not clash', async () => {
      const room = await createRoom(t.as, t.termiz.id);
      const spring = await t.as
        .post('/groups')
        .send({
          branchId: t.termiz.id,
          courseId,
          name: 'Spring',
          capacity: 5,
          startDate: '2026-02-01',
          endDate: '2026-05-31',
        })
        .expect(201);
      const autumn = await t.as
        .post('/groups')
        .send({
          branchId: t.termiz.id,
          courseId,
          name: 'Autumn',
          capacity: 5,
          startDate: '2026-09-01',
        })
        .expect(201);
      await addSchedule(t.as, spring.body.data.id, { roomId: room.id }).expect(201);
      await addSchedule(t.as, autumn.body.data.id, { roomId: room.id }).expect(201);
    });

    it('cross-branch room is rejected; deactivated slots free the room', async () => {
      const denovRoom = await createRoom(t.as, t.denov.id, '201');
      const termizRoom = await createRoom(t.as, t.termiz.id, '101');
      const a = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'A' });
      const b = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'B' });

      expect((await addSchedule(t.as, a.id, { roomId: denovRoom.id }).expect(400)).body.code).toBe(
        'ROOM_BRANCH_MISMATCH',
      );

      const slot = (await addSchedule(t.as, a.id, { roomId: termizRoom.id }).expect(201)).body.data;
      await addSchedule(t.as, b.id, { roomId: termizRoom.id }).expect(409);
      await t.as.delete(`/schedules/${slot.id}`).expect(200);
      await addSchedule(t.as, b.id, { roomId: termizRoom.id }).expect(201);
      // Re-activating the old slot now clashes.
      expect(
        (await t.as.patch(`/schedules/${slot.id}`).send({ isActive: true }).expect(409)).body.code,
      ).toBe('ROOM_SCHEDULE_CONFLICT');
    });

    it('cross-organization teacher/group cannot be scheduled or read', async () => {
      const other = await setupTenant(ctx, 'Other');
      const otherGroup = await createGroup(other.as, {
        branchId: other.termiz.id,
        courseId: (await createCourse(other.as, 'MATH')).id,
      });
      expect((await addSchedule(t.as, otherGroup.id).expect(404)).body.code).toBe(
        'GROUP_NOT_FOUND',
      );
      await t.as.get(`/groups/${otherGroup.id}/schedules`).expect(404);
    });

    it('parallel bookings of one room at the same time: exactly one wins', async () => {
      const room = await createRoom(t.as, t.termiz.id);
      const groups = await Promise.all(
        ['A', 'B', 'C', 'D', 'E'].map((name) =>
          createGroup(t.as, { branchId: t.termiz.id, courseId, name }),
        ),
      );
      const results = await Promise.all(
        groups.map((g) => addSchedule(t.as, g.id, { roomId: room.id })),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    });

    it('teacher sees schedules of own groups only; cannot manage schedules', async () => {
      const teacher = await teacherWithLogin(ctx, t, t.termiz.id);
      const own = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'Own' });
      const foreign = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'Foreign' });
      await t.as.patch(`/groups/${own.id}`).send({ teacherId: teacher.teacherId }).expect(200);

      await teacher.as.get(`/groups/${own.id}/schedules`).expect(200);
      expect((await teacher.as.get(`/groups/${foreign.id}/schedules`).expect(403)).body.code).toBe(
        'GROUP_ACCESS_DENIED',
      );
      expect((await addSchedule(teacher.as, own.id).expect(403)).body.code).toBe(
        'PERMISSION_DENIED',
      );
    });
  });
});

import {
  addSchedule,
  api,
  createCourse,
  createFamily,
  createGroup,
  createRoom,
  createStudent,
  enroll,
  memberOf,
  setupTenant,
  teacherWithLogin,
  type Tenant,
} from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Attendance (e2e)', () => {
  let ctx: TestContext;
  let t: Tenant;
  let courseId: string;
  let familyId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    t = await setupTenant(ctx);
    courseId = (await createCourse(t.as, 'MATH')).id;
    familyId = (await createFamily(t.as, t.termiz.id)).id;
  });
  afterAll(() => ctx.app.close());

  /** Group with `names.length` enrolled students (enrolled from 2026-09-01). */
  async function groupWithStudents(
    names: string[],
    opts: { teacherId?: string; branchId?: string } = {},
  ) {
    const branchId = opts.branchId ?? t.termiz.id;
    const group = await createGroup(t.as, { branchId, courseId, name: `G-${names.join('')}` });
    if (opts.teacherId)
      await t.as.patch(`/groups/${group.id}`).send({ teacherId: opts.teacherId }).expect(200);
    const enrollments: { id: string; studentId: string }[] = [];
    for (const name of names) {
      const student = await createStudent(t.as, familyId, branchId, name);
      enrollments.push(
        (await enroll(t.as, student.id, group.id, '2026-09-01').expect(201)).body.data,
      );
    }
    return { group, enrollments };
  }

  const mark = (as: ReturnType<typeof api>, groupId: string, date: string, records: object[]) =>
    as.post(`/attendance/group/${groupId}`).send({ date, records });

  it('bulk-marks a group and shows the attendance sheet', async () => {
    const room = await createRoom(t.as, t.termiz.id);
    const { group, enrollments } = await groupWithStudents(['Ali', 'Vali', 'Madina']);
    await t.as.patch(`/groups/${group.id}`).send({ roomId: room.id }).expect(200);
    const [ali, vali] = enrollments;

    const res = await mark(t.as, group.id, '2026-09-07', [
      { enrollmentId: ali.id, status: 'PRESENT', checkInAt: '2026-09-07T13:28:00Z' },
      { enrollmentId: vali.id, status: 'ABSENT', note: 'Kasal' },
    ]).expect(200);
    expect(res.body.data).toMatchObject({ groupId: group.id, created: 2, updated: 0 });
    expect(res.body.data.records[0]).toMatchObject({
      organizationId: t.orgId,
      branchId: t.termiz.id,
      status: 'PRESENT',
      markedById: t.owner.id,
    });

    const sheet = await t.as.get(`/groups/${group.id}/attendance?date=2026-09-07`).expect(200);
    expect(sheet.body.data).toMatchObject({
      group: { id: group.id },
      date: '2026-09-07T00:00:00.000Z',
      room: { id: room.id },
      teacher: null,
    });
    const byName = Object.fromEntries(
      (
        sheet.body.data.students as {
          student: { firstName: string };
          attendance: { status: string } | null;
        }[]
      ).map((row) => [row.student.firstName, row.attendance?.status ?? null]),
    );
    expect(byName).toEqual({ Ali: 'PRESENT', Vali: 'ABSENT', Madina: null });
  });

  it('re-marking the same date updates instead of duplicating', async () => {
    const { group, enrollments } = await groupWithStudents(['Ali']);
    await mark(t.as, group.id, '2026-09-07', [
      { enrollmentId: enrollments[0].id, status: 'ABSENT' },
    ]).expect(200);
    const again = await mark(t.as, group.id, '2026-09-07', [
      { enrollmentId: enrollments[0].id, status: 'LATE' },
    ]).expect(200);
    expect(again.body.data).toMatchObject({ created: 0, updated: 1 });
    const rows = await ctx.prisma.attendance.findMany({
      where: { enrollmentId: enrollments[0].id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('LATE');

    // Duplicates inside one request are rejected; the DB unique key is the backstop.
    const dup = await mark(t.as, group.id, '2026-09-08', [
      { enrollmentId: enrollments[0].id, status: 'PRESENT' },
      { enrollmentId: enrollments[0].id, status: 'ABSENT' },
    ]).expect(400);
    expect(dup.body.code).toBe('VALIDATION_ERROR');
    await expect(
      ctx.prisma.attendance.create({
        data: { ...rows[0], id: undefined, createdAt: undefined, updatedAt: undefined },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('validates enrollments, dates and check-in', async () => {
    const { group, enrollments } = await groupWithStudents(['Ali']);
    const other = await groupWithStudents(['Vali']);

    expect(
      (
        await mark(t.as, group.id, '2026-09-07', [
          { enrollmentId: other.enrollments[0].id, status: 'PRESENT' },
        ]).expect(400)
      ).body.code,
    ).toBe('ENROLLMENT_NOT_IN_GROUP');
    expect(
      (
        await mark(t.as, group.id, '2026-08-01', [
          { enrollmentId: enrollments[0].id, status: 'PRESENT' },
        ]).expect(400)
      ).body.code,
    ).toBe('ATTENDANCE_DATE_OUT_OF_RANGE');
    expect(
      (
        await mark(t.as, group.id, '2026-09-07', [
          { enrollmentId: enrollments[0].id, status: 'ABSENT', checkInAt: '2026-09-07T13:00:00Z' },
        ]).expect(400)
      ).body.code,
    ).toBe('VALIDATION_ERROR');

    await t.as
      .post(`/enrollments/${enrollments[0].id}/cancel`)
      .send({ endedAt: '2026-09-10' })
      .expect(200);
    expect(
      (
        await mark(t.as, group.id, '2026-09-11', [
          { enrollmentId: enrollments[0].id, status: 'PRESENT' },
        ]).expect(409)
      ).body.code,
    ).toBe('ENROLLMENT_NOT_ACTIVE');
    expect(await ctx.prisma.attendance.count()).toBe(0);
  });

  it('future dates need attendance.mark_future (DIRECTOR has it, TEACHER does not)', async () => {
    const teacher = await teacherWithLogin(ctx, t, t.termiz.id);
    const { group, enrollments } = await groupWithStudents(['Ali'], {
      teacherId: teacher.teacherId,
    });
    const record = [{ enrollmentId: enrollments[0].id, status: 'EXCUSED' }];

    const denied = await mark(teacher.as, group.id, '2099-01-05', record).expect(403);
    expect(denied.body.code).toBe('ATTENDANCE_FUTURE_DATE');
    await mark(t.as, group.id, '2099-01-05', record).expect(200);
  });

  it('updates and deletes a mark', async () => {
    const { group, enrollments } = await groupWithStudents(['Ali']);
    const created = (
      await mark(t.as, group.id, '2026-09-07', [
        { enrollmentId: enrollments[0].id, status: 'PRESENT', checkInAt: '2026-09-07T13:28:00Z' },
      ]).expect(200)
    ).body.data.records[0];

    const updated = await t.as
      .patch(`/attendance/${created.id}`)
      .send({ status: 'EXCUSED', note: 'Olimpiada' })
      .expect(200);
    // Check-in is dropped automatically when the student did not attend.
    expect(updated.body.data).toMatchObject({
      status: 'EXCUSED',
      note: 'Olimpiada',
      checkInAt: null,
    });

    await t.as.delete(`/attendance/${created.id}`).expect(200);
    await t.as.patch(`/attendance/${created.id}`).send({ status: 'PRESENT' }).expect(404);
  });

  describe('access control', () => {
    it('a teacher works only with their own groups', async () => {
      const teacherA = await teacherWithLogin(ctx, t, t.termiz.id, 'A');
      const teacherB = await teacherWithLogin(ctx, t, t.termiz.id, 'B');
      const groupA = await groupWithStudents(['Ali'], { teacherId: teacherA.teacherId });
      const groupB = await groupWithStudents(['Vali'], { teacherId: teacherB.teacherId });
      const [aliEnrollment] = groupA.enrollments;

      // Own group: read, mark, sheet, statistics, students.
      await teacherA.as.get(`/groups/${groupA.group.id}`).expect(200);
      await mark(teacherA.as, groupA.group.id, '2026-09-07', [
        { enrollmentId: aliEnrollment.id, status: 'PRESENT' },
      ]).expect(200);
      await teacherA.as.get(`/groups/${groupA.group.id}/attendance?date=2026-09-07`).expect(200);
      await teacherA.as.get(`/groups/${groupA.group.id}/attendance/statistics`).expect(200);
      await teacherA.as.get(`/students/${aliEnrollment.studentId}`).expect(200);
      await teacherA.as.get(`/students/${aliEnrollment.studentId}/attendance`).expect(200);

      const groups = await teacherA.as.get('/groups').expect(200);
      expect((groups.body.data.items as { id: string }[]).map((g) => g.id)).toEqual([
        groupA.group.id,
      ]);
      const students = await teacherA.as.get('/students').expect(200);
      expect((students.body.data.items as { id: string }[]).map((s) => s.id)).toEqual([
        aliEnrollment.studentId,
      ]);

      // Another teacher's group: 403 everywhere.
      const [valiEnrollment] = groupB.enrollments;
      const denied = await teacherA.as.get(`/groups/${groupB.group.id}`).expect(403);
      expect(denied.body.code).toBe('GROUP_ACCESS_DENIED');
      await mark(teacherA.as, groupB.group.id, '2026-09-07', [
        { enrollmentId: valiEnrollment.id, status: 'ABSENT' },
      ]).expect(403);
      await teacherA.as.get(`/groups/${groupB.group.id}/attendance`).expect(403);
      await teacherA.as.get(`/groups/${groupB.group.id}/attendance/statistics`).expect(403);
      await teacherA.as.get(`/students/${valiEnrollment.studentId}`).expect(403);
      await teacherA.as.get(`/students/${valiEnrollment.studentId}/attendance`).expect(403);

      const bMark = (
        await mark(t.as, groupB.group.id, '2026-09-07', [
          { enrollmentId: valiEnrollment.id, status: 'PRESENT' },
        ]).expect(200)
      ).body.data.records[0];
      await teacherA.as.patch(`/attendance/${bMark.id}`).send({ status: 'ABSENT' }).expect(403);
      // Teachers can't delete marks at all.
      expect((await teacherA.as.delete(`/attendance/${bMark.id}`).expect(403)).body.code).toBe(
        'PERMISSION_DENIED',
      );
    });

    it('a TEACHER-role member without a teacher profile sees nothing', async () => {
      const bare = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      const { group } = await groupWithStudents(['Ali']);
      expect((await bare.as.get('/groups').expect(200)).body.data.meta.total).toBe(0);
      await bare.as.get(`/groups/${group.id}/attendance`).expect(403);
    });

    it('branch isolation: a manager of Denov cannot touch Termiz attendance', async () => {
      const { group, enrollments } = await groupWithStudents(['Ali']);
      const manager = await memberOf(ctx, t, 'MANAGER', [t.denov.id]);
      expect(
        (
          await mark(manager.as, group.id, '2026-09-07', [
            { enrollmentId: enrollments[0].id, status: 'PRESENT' },
          ]).expect(403)
        ).body.code,
      ).toBe('BRANCH_ACCESS_DENIED');
      await manager.as.get(`/students/${enrollments[0].studentId}/attendance`).expect(403);
    });

    it('cross-organization access is impossible', async () => {
      const { group, enrollments } = await groupWithStudents(['Ali']);
      const created = (
        await mark(t.as, group.id, '2026-09-07', [
          { enrollmentId: enrollments[0].id, status: 'PRESENT' },
        ]).expect(200)
      ).body.data.records[0];
      const other = await setupTenant(ctx, 'Other');

      expect((await other.as.get(`/groups/${group.id}/attendance`).expect(404)).body.code).toBe(
        'GROUP_NOT_FOUND',
      );
      await other.as.get(`/students/${enrollments[0].studentId}/attendance`).expect(404);
      await other.as.patch(`/attendance/${created.id}`).send({ status: 'ABSENT' }).expect(404);
      await other.as.delete(`/attendance/${created.id}`).expect(404);
      // Marking another org's enrollment through my own group fails too.
      const mine = await setupTenant(ctx, 'Mine');
      const myGroup = await createGroup(mine.as, {
        branchId: mine.termiz.id,
        courseId: (await createCourse(mine.as, 'MATH')).id,
      });
      await mark(mine.as, myGroup.id, '2026-09-07', [
        { enrollmentId: enrollments[0].id, status: 'PRESENT' },
      ]).expect(400);
      // Foreign org header without membership.
      await api(ctx, other.owner, t.orgId).get(`/groups/${group.id}/attendance`).expect(403);
    });
  });

  describe('statistics', () => {
    it('student attendance percentage = (PRESENT + LATE) / total × 100, with filters', async () => {
      const { group, enrollments } = await groupWithStudents(['Ali']);
      const statuses = [
        'PRESENT',
        'PRESENT',
        'LATE',
        'ABSENT',
        'EXCUSED',
        'PRESENT',
        'ABSENT',
        'PRESENT',
      ];
      for (const [i, status] of statuses.entries()) {
        const day = String(i + 1).padStart(2, '0');
        await mark(t.as, group.id, `2026-09-${day}`, [
          { enrollmentId: enrollments[0].id, status },
        ]).expect(200);
      }
      const studentId = enrollments[0].studentId;

      const stats = await t.as.get(`/students/${studentId}/attendance/statistics`).expect(200);
      expect(stats.body.data).toEqual({
        studentId,
        from: null,
        to: null,
        totalLessons: 8,
        present: 4,
        absent: 2,
        late: 1,
        excused: 1,
        attendancePercentage: 62.5,
      });

      const firstDays = await t.as
        .get(`/students/${studentId}/attendance/statistics?from=2026-09-01&to=2026-09-03`)
        .expect(200);
      expect(firstDays.body.data).toMatchObject({ totalLessons: 3, attendancePercentage: 100 });

      const history = await t.as
        .get(`/students/${studentId}/attendance?status=ABSENT&from=2026-09-01&to=2026-09-30`)
        .expect(200);
      expect(history.body.data.meta.total).toBe(2);
      expect(history.body.data.items[0]).toMatchObject({
        status: 'ABSENT',
        group: { id: group.id },
      });

      await t.as.get(`/students/${studentId}/attendance?from=2026-09-30&to=2026-09-01`).expect(400);
    });

    it('group attendance statistics', async () => {
      const { group, enrollments } = await groupWithStudents(['Ali', 'Vali']);
      const [ali, vali] = enrollments;
      await mark(t.as, group.id, '2026-09-07', [
        { enrollmentId: ali.id, status: 'PRESENT' },
        { enrollmentId: vali.id, status: 'LATE' },
      ]).expect(200);
      await mark(t.as, group.id, '2026-09-09', [
        { enrollmentId: ali.id, status: 'ABSENT' },
        { enrollmentId: vali.id, status: 'PRESENT' },
      ]).expect(200);

      const res = await t.as.get(`/groups/${group.id}/attendance/statistics`).expect(200);
      expect(res.body.data).toEqual({
        groupId: group.id,
        from: null,
        to: null,
        lessonsCount: 2,
        totalAttendance: 4,
        present: 2,
        absent: 1,
        late: 1,
        excused: 0,
        averageAttendance: 75,
      });
    });
  });

  it('full flow: teacher + room + schedule → attendance → history → statistics', async () => {
    const room = await createRoom(t.as, t.termiz.id);
    const teacher = await teacherWithLogin(ctx, t, t.termiz.id);
    const group = await createGroup(t.as, { branchId: t.termiz.id, courseId, name: 'Math A' });
    await t.as
      .patch(`/groups/${group.id}`)
      .send({ teacherId: teacher.teacherId, roomId: room.id })
      .expect(200);
    for (const day of ['MONDAY', 'WEDNESDAY', 'FRIDAY']) {
      await addSchedule(t.as, group.id, { dayOfWeek: day }).expect(201);
    }
    const student = await createStudent(t.as, familyId, t.termiz.id);
    const enrollment = (await enroll(t.as, student.id, group.id, '2026-09-01').expect(201)).body
      .data;

    await mark(teacher.as, group.id, '2026-09-28', [
      { enrollmentId: enrollment.id, status: 'PRESENT' },
    ]).expect(200);
    const sheet = await teacher.as
      .get(`/groups/${group.id}/attendance?date=2026-09-28`)
      .expect(200);
    expect(sheet.body.data).toMatchObject({
      teacher: { id: teacher.teacherId },
      room: { id: room.id },
      students: [{ student: { id: student.id }, attendance: { status: 'PRESENT' } }],
    });
    const history = await teacher.as.get(`/students/${student.id}/attendance`).expect(200);
    expect(history.body.data.meta.total).toBe(1);
    const stats = await t.as.get(`/groups/${group.id}/attendance/statistics`).expect(200);
    expect(stats.body.data.averageAttendance).toBe(100);
  });
});

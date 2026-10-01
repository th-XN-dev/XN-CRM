import { CenterStatus } from '@prisma/client';
import { ChecklistSchedulerService } from '../src/checklists/checklist-scheduler.service';
import { BackgroundTasks } from '../src/common/events/background-tasks';
import { type Api, memberOf, setupTenant, type Tenant } from './utils/academic';
import { orgToday, seedBusiness } from './utils/business';
import { type TestUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

/**
 * Part 1 of the work & communication changes: daily checklists, tasks for
 * several employees with reasons, announcements and congratulations as their
 * own communication types, individual grants, and the dashboard analytics.
 */
describe('Checklists, tasks, communications and dashboard analytics (e2e)', () => {
  let ctx: TestContext;
  let t: Tenant;
  let cashier: { user: TestUser; as: Api };
  let teacher: { user: TestUser; as: Api };
  let cashierEmployee: string;
  let teacherEmployee: string;

  async function employeeFor(user: TestUser, name: string, extra: Record<string, unknown> = {}) {
    const res = await t.as
      .post('/employees')
      .send({
        firstName: name,
        lastName: 'Test',
        phone: '+998901234567',
        primaryBranchId: t.termiz.id,
        userId: user.id,
        ...extra,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    t = await setupTenant(ctx, 'Work Academy');
    cashier = await memberOf(ctx, t, 'CASHIER', [t.termiz.id]);
    teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
    cashierEmployee = await employeeFor(cashier.user, 'Kassir');
    teacherEmployee = await employeeFor(teacher.user, 'Ustoz');
  });
  afterAll(() => ctx.app.close());

  describe('Checklists', () => {
    let checklistId: string;

    it('the director creates a timed daily checklist; today’s item appears for the assignee', async () => {
      const res = await t.as
        .post('/checklists')
        .send({
          title: 'Kassani tekshirish',
          dueTime: '09:00',
          assigneeId: cashierEmployee,
          branchId: t.termiz.id,
        })
        .expect(201);
      checklistId = res.body.data.id as string;
      expect(res.body.data).toMatchObject({
        dueTime: '09:00',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        canManage: true,
      });

      const day = await cashier.as.get('/checklists/day').expect(200);
      expect(day.body.data.date).toBe(orgToday());
      expect(day.body.data.items).toHaveLength(1);
      expect(day.body.data.items[0]).toMatchObject({
        template: { title: 'Kassani tekshirish', dueTime: '09:00' },
        canEdit: true,
        completedAt: null,
      });
      // 09:00 Tashkent = 04:00 UTC of that day.
      expect(day.body.data.items[0].dueAt).toBe(`${orgToday()}T04:00:00.000Z`);
    });

    it('the scheduler creates each day once (idempotent)', async () => {
      const scheduler = ctx.app.get(ChecklistSchedulerService);
      expect(await scheduler.generateToday()).toBe(0); // already there
      await ctx.prisma.checklistItem.deleteMany({ where: { templateId: checklistId } });
      expect(await scheduler.generateToday()).toBe(1);
      expect(await scheduler.generateToday()).toBe(0);
      // Not for frozen centers.
      await ctx.prisma.organization.update({
        where: { id: t.orgId },
        data: { status: CenterStatus.FROZEN },
      });
      await ctx.prisma.checklistItem.deleteMany({ where: { templateId: checklistId } });
      expect(await scheduler.generateToday()).toBe(0);
      await ctx.prisma.organization.update({
        where: { id: t.orgId },
        data: { status: CenterStatus.ACTIVE },
      });
    });

    it('the assignee ticks it off and writes the inline comment (autosave)', async () => {
      const day = await cashier.as.get('/checklists/day').expect(200);
      const id = day.body.data.items[0].id as string;
      await cashier.as
        .patch(`/checklists/items/${id}`)
        .send({ comment: 'Kassa: 1 200 000' })
        .expect(200);
      const saved = await cashier.as
        .patch(`/checklists/items/${id}`)
        .send({ comment: 'Kassa: 1 250 000 so‘m, hammasi joyida', done: true })
        .expect(200);
      expect(saved.body.data.comment).toBe('Kassa: 1 250 000 so‘m, hammasi joyida');
      expect(saved.body.data.completedAt).not.toBeNull();
      const again = await cashier.as.get('/checklists/day').expect(200);
      expect(again.body.data.stats).toMatchObject({ total: 1, done: 1 });
    });

    it('other staff neither see nor change someone else’s checklist', async () => {
      const own = await teacher.as.get('/checklists/day').expect(200);
      expect(own.body.data.items).toHaveLength(0);
      const day = await cashier.as.get('/checklists/day').expect(200);
      const id = day.body.data.items[0].id as string;
      await teacher.as.patch(`/checklists/items/${id}`).send({ done: false }).expect(404);
      await teacher.as
        .post('/checklists')
        .send({ title: 'X', dueTime: '10:00', assigneeId: teacherEmployee, branchId: t.termiz.id })
        .expect(403);
    });

    it('the director can grant “create checklists” to a staff member', async () => {
      const staff = await t.as.get(`/organizations/${t.orgId}/staff?search=TEACHER`).expect(200);
      const membership = (staff.body.data.items as { id: string; user: { id: string } }[]).find(
        (m) => m.user.id === teacher.user.id,
      )!;
      await t.as
        .patch(`/organizations/${t.orgId}/staff/${membership.id}`)
        .send({ grantedPermissions: ['checklists.manage'] })
        .expect(200);
      const created = await teacher.as
        .post('/checklists')
        .send({
          title: 'Jurnalni to‘ldirish',
          dueTime: '17:30',
          assigneeId: teacherEmployee,
          branchId: t.termiz.id,
        })
        .expect(201);
      expect(created.body.data.canManage).toBe(true);
      // Only grantable permissions, and only ones the granter has.
      await t.as
        .patch(`/organizations/${t.orgId}/staff/${membership.id}`)
        .send({ grantedPermissions: ['finance.read'] })
        .expect(422);
    });
  });

  describe('Tasks', () => {
    it('one task for several employees: a copy each, linked by batch', async () => {
      const res = await t.as
        .post('/tasks/batch')
        .send({
          title: 'Ota-onalar bilan bog‘lanish',
          branchId: t.termiz.id,
          dueDate: new Date(Date.now() + 86_400_000).toISOString(),
          assigneeIds: [cashierEmployee, teacherEmployee],
        })
        .expect(201);
      expect(res.body.data.count).toBe(2);
      const batchId = res.body.data.batchId as string;
      expect(
        res.body.data.tasks.every((task: { batchId: string }) => task.batchId === batchId),
      ).toBe(true);
      const mine = await cashier.as.get('/tasks?mine=true').expect(200);
      expect((mine.body.data.items as { title: string }[]).map((x) => x.title)).toContain(
        'Ota-onalar bilan bog‘lanish',
      );
    });

    it('everyone in the branch', async () => {
      const res = await t.as
        .post('/tasks/batch')
        .send({ title: 'Majlisga tayyorlaning', branchId: t.termiz.id, allEmployees: true })
        .expect(201);
      expect(res.body.data.count).toBe(2);
      await t.as
        .post('/tasks/batch')
        .send({ title: 'Nobody', branchId: t.termiz.id, assigneeIds: [] })
        .expect(400);
    });

    it('waiting or cancelled needs a reason', async () => {
      const task = await t.as
        .post('/tasks')
        .send({ title: 'Hisobot', branchId: t.termiz.id, assignedToId: cashierEmployee })
        .expect(201);
      const missing = await cashier.as
        .patch(`/tasks/${task.body.data.id}/status`)
        .send({ status: 'BLOCKED' })
        .expect(400);
      expect(missing.body.code).toBe('TASK_REASON_REQUIRED');
      await cashier.as
        .patch(`/tasks/${task.body.data.id}/status`)
        .send({ status: 'BLOCKED', note: 'Kassa hisoboti kutilmoqda' })
        .expect(200);
    });
  });

  describe('Announcements and congratulations', () => {
    it('an announcement reaches all staff, is listed apart from tasks and counts readers', async () => {
      const sent = await t.as
        .post('/announcements')
        .send({ title: 'Majlis', message: 'Ertaga 10:00 da umumiy majlis', audience: 'everyone' })
        .expect(201);
      expect(sent.body.data.recipients).toBe(2); // everyone but the sender
      await ctx.app.get(BackgroundTasks).idle();

      const inbox = await cashier.as.get('/notifications?type=ANNOUNCEMENT').expect(200);
      expect(inbox.body.data.items).toHaveLength(1);
      await cashier.as.patch(`/notifications/${inbox.body.data.items[0].id}/read`).expect(200);

      const list = await t.as.get('/announcements/sent').expect(200);
      expect(list.body.data[0]).toMatchObject({ title: 'Majlis', recipients: 2, read: 1 });
      await cashier.as
        .post('/announcements')
        .send({ title: 'X', message: 'Y', audience: 'everyone' })
        .expect(403);
    });

    it('a congratulation goes to the chosen employees; upcoming birthdays are suggested', async () => {
      const today = orgToday();
      const birthday = `1995-${today.slice(5)}`; // born on this day
      await t.as.patch(`/employees/${teacherEmployee}`).send({ birthDate: birthday }).expect(200);
      const occasions = await t.as.get('/congratulations/occasions?days=7').expect(200);
      expect(occasions.body.data).toContainEqual(
        expect.objectContaining({
          occasion: 'BIRTHDAY',
          daysLeft: 0,
          employee: expect.objectContaining({ id: teacherEmployee }),
        }),
      );

      const res = await t.as
        .post('/congratulations')
        .send({
          employeeIds: [teacherEmployee],
          occasion: 'BIRTHDAY',
          message: 'Tug‘ilgan kuningiz muborak!',
        })
        .expect(201);
      expect(res.body.data.recipients).toBe(1);
      const inbox = await teacher.as.get('/notifications?type=CONGRATULATION').expect(200);
      expect(inbox.body.data.items[0]).toMatchObject({ title: 'Tug‘ilgan kuningiz bilan!' });
      // Not a task, not an announcement.
      const announcements = await teacher.as.get('/notifications?type=ANNOUNCEMENT').expect(200);
      expect(announcements.body.data.items).toHaveLength(1);
      await cashier.as
        .post('/congratulations')
        .send({ employeeIds: [teacherEmployee], occasion: 'THANKS', message: 'x' })
        .expect(403);
    });
  });

  describe('Dashboard analytics', () => {
    let business: Awaited<ReturnType<typeof seedBusiness>>;

    beforeAll(async () => {
      business = await seedBusiness(t.as, t, 'D');
    });

    it('students, money and attendance with the previous period and series', async () => {
      const res = await t.as.get('/dashboard/analytics?period=month').expect(200);
      const d = res.body.data;
      expect(d.students).toMatchObject({
        active: 3,
        newStudents: { current: 3, previous: 0, change: 3 },
      });
      expect(d.students.series.length).toBeGreaterThan(0);
      expect(d.finance).toMatchObject({
        expected: { current: '500000' },
        collected: { current: '300000' },
        paid: '300000',
        unpaid: '200000',
        debt: '200000',
        prepayment: '0',
      });
      expect(d.finance.byMethod).toEqual([{ method: 'CARD', amount: '300000', payments: 1 }]);
      expect(d.finance.byBranch[0]).toMatchObject({
        id: t.termiz.id,
        collected: '300000',
        debt: '200000',
      });
      expect(d.finance.byCashier[0]).toMatchObject({ amount: '300000', payments: 1 });
      expect(d.finance.series.at(-1).debt).toBe('200000');
      expect(d.attendance).toMatchObject({
        marks: 2,
        present: 1,
        absent: 1,
        lessons: 1,
        rate: { current: 50 },
      });
      expect(d.attendance.byGroup[0]).toMatchObject({ id: business.groupId, rate: 50 });
    });

    it('filters narrow every section: group, course, teacher, one day, cashier', async () => {
      const byGroup = await t.as
        .get(`/dashboard/analytics?groupId=${business.groupId}`)
        .expect(200);
      expect(byGroup.body.data.students.active).toBe(2); // Ali and Vali, not the converted lead
      expect(byGroup.body.data.finance.paid).toBe('300000'); // paid for Ali
      const otherCourse = await t.as
        .get(`/dashboard/analytics?courseId=00000000-0000-7000-8000-000000000000`)
        .expect(200);
      expect(otherCourse.body.data.students.total).toBe(0);
      expect(otherCourse.body.data.attendance.marks).toBe(0);
      const byTeacher = await t.as
        .get(`/dashboard/analytics?teacherId=${business.teacherId}`)
        .expect(200);
      expect(byTeacher.body.data.attendance.marks).toBe(2);
      const yesterday = await t.as.get(`/dashboard/analytics?date=${orgToday(-1)}`).expect(200);
      expect(yesterday.body.data.finance.paid).toBe('0');
      const someoneElse = await t.as
        .get(`/dashboard/analytics?cashierId=${cashier.user.id}`)
        .expect(200);
      expect(someoneElse.body.data.finance.paid).toBe('0');
      expect(someoneElse.body.data.finance.expected.current).toBe('500000'); // invoices aren't a cashier's
    });

    it('sections follow permissions; other branches are refused', async () => {
      const res = await teacher.as.get('/dashboard/analytics').expect(200);
      expect(res.body.data).toMatchObject({ students: null, finance: null, attendance: null });
      const denovOnly = await memberOf(ctx, t, 'MANAGER', [t.denov.id]);
      await denovOnly.as.get(`/dashboard/analytics?branchId=${t.termiz.id}`).expect(403);
      const own = await denovOnly.as.get('/dashboard/analytics').expect(200);
      expect(own.body.data.finance.paid).toBe('0');
    });

    it('a personal layout: order, hidden widgets, chart type, saved filters; reset to default', async () => {
      const initial = await t.as.get('/dashboard/layout').expect(200);
      expect(initial.body.data.customized).toBe(false);
      const widgets = [...initial.body.data.widgets].reverse();
      widgets[0] = { ...widgets[0], visible: false };
      widgets[1] = { ...widgets[1], chart: 'line' };
      const saved = await t.as
        .put('/dashboard/layout')
        .send({ widgets, filters: { period: 'quarter', branchId: t.termiz.id } })
        .expect(200);
      expect(saved.body.data.customized).toBe(true);
      expect(saved.body.data.widgets[0]).toMatchObject({ key: widgets[0].key, visible: false });
      expect(saved.body.data.filters).toEqual({ period: 'quarter', branchId: t.termiz.id });
      // Another member keeps their own default.
      expect((await cashier.as.get('/dashboard/layout').expect(200)).body.data.customized).toBe(
        false,
      );
      const reset = await t.as.delete('/dashboard/layout').expect(200);
      expect(reset.body.data.customized).toBe(false);
      await t.as
        .put('/dashboard/layout')
        .send({ widgets: [{ key: 'nope', visible: true }], filters: {} })
        .expect(422);
    });
  });
});

import { BackgroundTasks } from '../src/common/events/background-tasks';
import { NotificationActivity } from '../src/notifications/handlers/notification-activity';
import { addSchedule, api, createLevel, createRoom } from './utils/academic';
import { orgToday } from './utils/business';
import { PASSWORD, registerUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

/**
 * XN CRM Backend V1.0 end to end, through the public API only:
 * User → Organization → Branch → Family → Student → Course → Level → Group →
 * Enrollment → Schedule → Attendance → Invoice → Payment → Debt → Lead →
 * Conversion → Employee → Task → Notification → Report → Audit.
 */
describe('V1.0 business flow (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(() => ctx.app.close());

  const settle = async () => {
    await ctx.app.get(NotificationActivity).idle();
    await ctx.app.get(BackgroundTasks).idle();
  };

  it('runs a whole school day and reports on it', async () => {
    // ── account & organization ──────────────────────────────────────────
    const email = `director-${Date.now()}@xn.uz`;
    await ctx
      .http()
      .post('/auth/register')
      .send({ name: 'Director', email, password: PASSWORD })
      .expect(201);
    const login = await ctx
      .http()
      .post('/auth/login')
      .send({ login: email, password: PASSWORD })
      .expect(200);
    const token = login.body.data.tokens.accessToken as string;
    const me = await ctx.http().get('/auth/me').auth(token, { type: 'bearer' }).expect(200);
    const owner = { id: me.body.data.id as string, email, accessToken: token, refreshToken: '' };

    const org = await ctx
      .http()
      .post('/organizations')
      .auth(token, { type: 'bearer' })
      .send({ name: 'Jony Academy V1' })
      .expect(201);
    const orgId = org.body.data.id as string;
    const branch = await ctx
      .http()
      .post(`/organizations/${orgId}/branches`)
      .auth(token, { type: 'bearer' })
      .send({ name: 'Termiz', code: 'TRM' })
      .expect(201);
    const branchId = branch.body.data.id as string;
    const as = api(ctx, owner, orgId, branchId);

    // ── academic core ───────────────────────────────────────────────────
    const family = (
      await as
        .post('/families')
        .send({ name: 'Karimovlar', phone: '+998901234567', primaryBranchId: branchId })
        .expect(201)
    ).body.data as { id: string };
    const student = (
      await as
        .post('/students')
        .send({ familyId: family.id, branchId, firstName: 'Ali', lastName: 'Karimov' })
        .expect(201)
    ).body.data as { id: string };
    const course = (
      await as
        .post('/courses')
        .send({ name: 'English', code: 'ENG', monthlyPrice: 450000 })
        .expect(201)
    ).body.data as { id: string };
    const level = await createLevel(as, course.id, 'A1');
    const group = (
      await as
        .post('/groups')
        .send({
          branchId,
          courseId: course.id,
          levelId: level.id,
          name: 'ENG-A1',
          capacity: 12,
          startDate: '2026-01-10',
        })
        .expect(201)
    ).body.data as { id: string };
    const enrollment = (
      await as
        .post('/enrollments')
        .send({ studentId: student.id, groupId: group.id, startedAt: '2026-09-01' })
        .expect(201)
    ).body.data as { id: string };

    const teacher = (
      await as
        .post('/teachers')
        .send({ branchId, firstName: 'Dilnoza', lastName: 'Rahimova' })
        .expect(201)
    ).body.data as { id: string };
    const room = await createRoom(as, branchId);
    await as
      .patch(`/groups/${group.id}`)
      .send({ teacherId: teacher.id, roomId: room.id })
      .expect(200);
    await addSchedule(as, group.id, {
      dayOfWeek: 'MONDAY',
      startTime: '16:00',
      endTime: '17:30',
    }).expect(201);

    await as
      .post(`/attendance/group/${group.id}`)
      .send({ date: orgToday(), records: [{ enrollmentId: enrollment.id, status: 'PRESENT' }] })
      .expect(200);

    // ── finance ─────────────────────────────────────────────────────────
    const invoice = (
      await as
        .post('/invoices')
        .send({
          familyId: family.id,
          studentId: student.id,
          amount: 450000,
          discount: 50000,
          dueDate: orgToday(10),
          branchId,
        })
        .expect(201)
    ).body.data as { id: string; finalAmount: string };
    expect(invoice.finalAmount).toBe('400000');
    await as
      .post('/payments')
      .send({ invoiceId: invoice.id, amount: 250000, method: 'CARD' })
      .expect(201);
    const debt = (await as.get(`/invoices/${invoice.id}`).expect(200)).body.data;
    expect(debt).toMatchObject({ status: 'PARTIAL', paid: '250000', debt: '150000' });

    // ── CRM ─────────────────────────────────────────────────────────────
    const lead = (
      await as.post('/leads').send({ name: 'Madina', phone: '+998907776655', branchId }).expect(201)
    ).body.data as { id: string };
    const converted = (
      await as
        .post(`/leads/${lead.id}/convert`)
        .send({ student: { firstName: 'Madina', lastName: 'Aliyeva' }, groupId: group.id })
        .expect(201)
    ).body.data as { enrollmentId: string | null };
    expect(converted.enrollmentId).toBeTruthy();

    // ── HR, task and the notification it triggers ───────────────────────
    const manager = await registerUser(ctx, 'Branch Manager');
    await ctx.prisma.organizationMembership.create({
      data: {
        userId: manager.id,
        organizationId: orgId,
        allBranches: true,
        roleId: (
          await ctx.prisma.role.findFirstOrThrow({
            where: { key: 'MANAGER', organizationId: null },
          })
        ).id,
      },
    });
    const employee = (
      await as
        .post('/employees')
        .send({
          firstName: 'Bekzod',
          lastName: 'Toshev',
          phone: '+998935554433',
          primaryBranchId: branchId,
          userId: manager.id,
        })
        .expect(201)
    ).body.data as { id: string };
    const task = (
      await as
        .post('/tasks')
        .send({ title: 'Call Karimovlar about the debt', branchId, assignedToId: employee.id })
        .expect(201)
    ).body.data as { id: string };

    await settle();
    const managerApi = api(ctx, manager, orgId);
    const inbox = (await managerApi.get('/notifications').expect(200)).body.data;
    expect(inbox.items[0]).toMatchObject({ type: 'TASK_ASSIGNED', relatedId: task.id });

    // ── reports, dashboard, audit ───────────────────────────────────────
    const finance = (await as.get('/reports/finance/summary').expect(200)).body.data;
    expect(finance).toMatchObject({
      totalInvoiced: '400000',
      totalPaid: '250000',
      totalDebt: '150000',
    });
    const students = (await as.get('/reports/students/summary').expect(200)).body.data;
    expect(students).toMatchObject({ totalStudents: 2, active: 2 });
    const attendance = (await as.get('/reports/attendance/summary').expect(200)).body.data;
    expect(attendance).toMatchObject({ totalLessons: 1, present: 1, attendanceRate: 100 });
    const leads = (await as.get('/reports/leads/summary').expect(200)).body.data;
    expect(leads).toMatchObject({ totalLeads: 1, converted: 1 });
    const dashboard = (await as.get('/dashboard/overview').expect(200)).body.data;
    expect(dashboard).toMatchObject({ groups: { active: 1 }, tasks: { open: 1 } });

    const audit = (await as.get('/audit-logs?limit=100').expect(200)).body.data as {
      items: { action: string }[];
    };
    expect(audit.items.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'STUDENT_CREATED',
        'ENROLLMENT_CREATED',
        'SCHEDULE_CREATED',
        'ATTENDANCE_MARKED',
        'INVOICE_CREATED',
        'PAYMENT_CREATED',
        'LEAD_CONVERTED',
        'EMPLOYEE_CREATED',
        'TASK_CREATED',
        'CREATE', // courses, levels, rooms... (event-less configuration)
      ]),
    );
  });
});

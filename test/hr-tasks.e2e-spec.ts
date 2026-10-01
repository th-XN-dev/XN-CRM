import { randomUUID } from 'node:crypto';
import {
  type Api,
  createFamily,
  createStudent,
  memberOf,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { registerUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

interface Employee {
  id: string;
  primaryBranchId: string;
  userId: string | null;
  status: string;
  terminationDate: string | null;
  branches: { branchId: string; isPrimary: boolean }[];
}

interface Task {
  id: string;
  status: string;
  assignedToId: string | null;
  completedAt: string | null;
  isOverdue: boolean;
}

describe('HR & Task Management (e2e)', () => {
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

  /** Ids of a paginated response's items, in order. */
  const ids = (body: unknown) =>
    (body as { data: { items: { id: string }[] } }).data.items.map((item) => item.id);

  const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  async function createEmployee(as: Api, body: Record<string, unknown> = {}): Promise<Employee> {
    const res = await as
      .post('/employees')
      .send({
        firstName: 'Xusanjon',
        lastName: 'Rahimova',
        phone: '+998901234567',
        primaryBranchId: t.termiz.id,
        ...body,
      })
      .expect(201);
    return res.body.data as Employee;
  }

  async function createTask(as: Api, body: Record<string, unknown> = {}): Promise<Task> {
    const res = await as
      .post('/tasks')
      .send({ title: 'Call the parents', branchId: t.termiz.id, ...body })
      .expect(201);
    return res.body.data as Task;
  }

  async function createPosition(as: Api, code = 'SALES_MANAGER') {
    const res = await as.post('/positions').send({ name: code, code }).expect(201);
    return res.body.data as { id: string; code: string; isActive: boolean };
  }

  const historyTypes = async (as: Api, taskId: string) => {
    const res = await as.get(`/tasks/${taskId}/history?limit=100`).expect(200);
    return (res.body.data.items as { type: string }[]).map((item) => item.type).reverse();
  };

  // ─── HR ───────────────────────────────────────────────────────────────────

  describe('positions & departments', () => {
    it('manages positions per organization with soft delete', async () => {
      const position = await createPosition(t.as, ' sales_manager ');
      expect(position).toMatchObject({ code: 'SALES_MANAGER', isActive: true });

      const dup = await t.as.post('/positions').send({ name: 'X', code: 'SALES_MANAGER' });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('POSITION_CODE_TAKEN');

      await createPosition(t.as, 'TEACHER');
      const list = await t.as.get('/positions?limit=1').expect(200);
      expect(list.body.data.meta).toMatchObject({ total: 2, totalPages: 2, limit: 1 });

      await t.as.patch(`/positions/${position.id}`).send({ name: 'Senior sales' }).expect(200);
      const removed = await t.as.delete(`/positions/${position.id}`).expect(200);
      expect(removed.body.data.isActive).toBe(false);

      const inactive = await t.as
        .post('/employees')
        .send({
          firstName: 'A',
          lastName: 'B',
          phone: '+998901234567',
          primaryBranchId: t.termiz.id,
          positionId: position.id,
        })
        .expect(409);
      expect(inactive.body.code).toBe('POSITION_INACTIVE');

      // Another organization reuses the same code independently.
      const other = await setupTenant(ctx, 'Other Academy');
      await createPosition(other.as, 'SALES_MANAGER');
      await other.as.get(`/positions/${position.id}`).expect(404);
    });

    it('manages departments and counts their employees', async () => {
      const dept = await t.as
        .post('/departments')
        .send({ name: 'Sales', code: 'sales' })
        .expect(201);
      expect(dept.body.data).toMatchObject({ code: 'SALES', employeeCount: 0 });
      await createEmployee(t.as, { departmentId: dept.body.data.id });

      const fetched = await t.as.get(`/departments/${dept.body.data.id}`).expect(200);
      expect(fetched.body.data.employeeCount).toBe(1);
      const search = await t.as.get('/departments?search=sal').expect(200);
      expect(search.body.data.meta.total).toBe(1);
    });
  });

  describe('employees', () => {
    it('creates an employee with position, department and branches in one go', async () => {
      const position = await createPosition(t.as);
      const dept = await t.as
        .post('/departments')
        .send({ name: 'Sales', code: 'SALES' })
        .expect(201);
      const employee = await createEmployee(t.as, {
        positionId: position.id,
        departmentId: dept.body.data.id,
        branchIds: [t.denov.id, t.termiz.id],
        email: ' Xusanjon@Test.UZ ',
        hireDate: '2026-01-15',
      });

      expect(employee).toMatchObject({ primaryBranchId: t.termiz.id, status: 'ACTIVE' });
      expect(employee.branches).toEqual([
        expect.objectContaining({ branchId: t.termiz.id, isPrimary: true }),
        expect.objectContaining({ branchId: t.denov.id, isPrimary: false }),
      ]);
      const fetched = await t.as.get(`/employees/${employee.id}`).expect(200);
      expect(fetched.body.data).toMatchObject({
        email: 'xusanjon@test.uz', // emails are stored lower-cased
        position: { code: 'SALES_MANAGER' },
        department: { code: 'SALES' },
      });
    });

    it('creation is atomic: a bad branch leaves no employee behind', async () => {
      const other = await setupTenant(ctx, 'Other Academy');
      await t.as
        .post('/employees')
        .send({
          firstName: 'A',
          lastName: 'B',
          phone: '+998901234567',
          primaryBranchId: t.termiz.id,
          branchIds: [other.termiz.id],
        })
        .expect((res) => expect([403, 404]).toContain(res.status));
      expect(await ctx.prisma.employee.count()).toBe(0);
      expect(await ctx.prisma.employeeBranch.count()).toBe(0);
    });

    it('updates, terminates (soft delete) and filters employees', async () => {
      const position = await createPosition(t.as);
      const Xusanjon = await createEmployee(t.as, { positionId: position.id });
      const bobur = await createEmployee(t.as, {
        firstName: 'Bobur',
        lastName: 'Karimov',
        phone: '+998907654321',
        primaryBranchId: t.denov.id,
      });

      const updated = await t.as
        .patch(`/employees/${Xusanjon.id}`)
        .send({ status: 'ON_LEAVE', notes: 'Maternity leave' })
        .expect(200);
      expect(updated.body.data).toMatchObject({ status: 'ON_LEAVE', terminationDate: null });

      const terminated = await t.as.delete(`/employees/${bobur.id}`).expect(200);
      expect(terminated.body.data.status).toBe('TERMINATED');
      expect(terminated.body.data.terminationDate).not.toBeNull();
      expect(await ctx.prisma.employee.count()).toBe(2);

      const byName = await t.as.get('/employees?search=bob').expect(200);
      expect(ids(byName.body)).toEqual([bobur.id]);
      const byPhone = await t.as.get('/employees?search=7654').expect(200);
      expect(byPhone.body.data.meta.total).toBe(1);
      const byStatus = await t.as.get('/employees?status=TERMINATED').expect(200);
      expect(byStatus.body.data.meta.total).toBe(1);
      const byPosition = await t.as.get(`/employees?positionId=${position.id}`).expect(200);
      expect(byPosition.body.data.meta.total).toBe(1);
      const byBranch = await t.as.get(`/employees?branchId=${t.denov.id}`).expect(200);
      expect(ids(byBranch.body)).toEqual([bobur.id]);
      const paged = await t.as.get('/employees?limit=1&page=2&sortBy=firstName').expect(200);
      // Sorted by first name: Bobur, Xusanjon → page 2 is Xusanjon.
      expect(paged.body.data.items[0].id).toBe(Xusanjon.id);
      expect(paged.body.data.meta).toMatchObject({ page: 2, total: 2, totalPages: 2 });
    });

    it('manages employee branches and keeps exactly one primary', async () => {
      const employee = await createEmployee(t.as);

      await t.as
        .post(`/employees/${employee.id}/branches`)
        .send({ branchId: t.denov.id })
        .expect(201);
      const dup = await t.as
        .post(`/employees/${employee.id}/branches`)
        .send({ branchId: t.denov.id })
        .expect(409);
      expect(dup.body.code).toBe('EMPLOYEE_BRANCH_EXISTS');

      const primaryRemoval = await t.as
        .delete(`/employees/${employee.id}/branches/${t.termiz.id}`)
        .expect(409);
      expect(primaryRemoval.body.code).toBe('EMPLOYEE_PRIMARY_BRANCH_REQUIRED');

      const moved = await t.as
        .patch(`/employees/${employee.id}/branches/${t.denov.id}/primary`)
        .expect(200);
      expect(moved.body.data).toEqual([
        expect.objectContaining({ branchId: t.denov.id, isPrimary: true }),
        expect.objectContaining({ branchId: t.termiz.id, isPrimary: false }),
      ]);
      const fetched = await t.as.get(`/employees/${employee.id}`).expect(200);
      expect(fetched.body.data.primaryBranchId).toBe(t.denov.id);

      const left = await t.as
        .delete(`/employees/${employee.id}/branches/${t.termiz.id}`)
        .expect(200);
      expect(left.body.data).toHaveLength(1);
      await t.as.delete(`/employees/${employee.id}/branches/${t.termiz.id}`).expect(404);
    });

    it('links an employee to a CRM login (member only, one employee per user)', async () => {
      const cashier = await memberOf(ctx, t, 'CASHIER', [t.termiz.id]);
      const employee = await createEmployee(t.as, { userId: cashier.user.id });
      expect(employee.userId).toBe(cashier.user.id);

      const taken = await t.as
        .post('/employees')
        .send({
          firstName: 'X',
          lastName: 'Y',
          phone: '+998901111111',
          primaryBranchId: t.termiz.id,
          userId: cashier.user.id,
        })
        .expect(409);
      expect(taken.body.code).toBe('EMPLOYEE_USER_TAKEN');

      const outsider = await registerUser(ctx, 'Outsider');
      const notMember = await t.as
        .patch(`/employees/${employee.id}`)
        .send({ userId: outsider.id })
        .expect(400);
      expect(notMember.body.code).toBe('EMPLOYEE_USER_NOT_MEMBER');

      const unlinked = await t.as
        .patch(`/employees/${employee.id}`)
        .send({ userId: null })
        .expect(200);
      expect(unlinked.body.data.userId).toBeNull();
      const withUser = await t.as.get('/employees?hasUser=true').expect(200);
      expect(withUser.body.data.meta.total).toBe(0);
    });

    it('enforces HR permissions and branch/organization isolation', async () => {
      const termizOnly = await createEmployee(t.as);

      const teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      await teacher.as.get('/employees').expect(403);
      await teacher.as.get('/positions').expect(403);

      const denovManager = await memberOf(ctx, t, 'MANAGER', [t.denov.id]);
      const denied = await denovManager.as.get(`/employees/${termizOnly.id}`).expect(403);
      expect(denied.body.code).toBe('BRANCH_ACCESS_DENIED');
      const list = await denovManager.as.get('/employees').expect(200);
      expect(list.body.data.meta.total).toBe(0);
      await denovManager.as
        .post('/employees')
        .send({ firstName: 'A', lastName: 'B', phone: '+998901234567' })
        .expect(403);

      const other = await setupTenant(ctx, 'Other Academy');
      const crossOrg = await other.as.get(`/employees/${termizOnly.id}`).expect(404);
      expect(crossOrg.body.code).toBe('EMPLOYEE_NOT_FOUND');
    });
  });

  // ─── Tasks ────────────────────────────────────────────────────────────────

  describe('tasks', () => {
    it('creates a task with assignee and a validated related resource', async () => {
      const employee = await createEmployee(t.as);
      const family = await createFamily(t.as, t.termiz.id);
      const student = await createStudent(t.as, family.id, t.termiz.id);

      const task = await createTask(t.as, {
        priority: 'HIGH',
        dueDate: hoursFromNow(48),
        assignedToId: employee.id,
        relatedType: 'STUDENT',
        relatedId: student.id,
      });
      expect(task).toMatchObject({ status: 'TODO', assignedToId: employee.id, isOverdue: false });
      // Same transaction → same timestamp, so compare without order.
      expect((await historyTypes(t.as, task.id)).sort()).toEqual(['ASSIGNED', 'CREATED']);

      const missing = await t.as
        .post('/tasks')
        .send({ title: 'X', branchId: t.termiz.id, relatedType: 'LEAD', relatedId: randomUUID() })
        .expect(404);
      expect(missing.body.code).toBe('TASK_RELATED_NOT_FOUND');
      await t.as
        .post('/tasks')
        .send({ title: 'X', branchId: t.termiz.id, relatedType: 'LEAD' })
        .expect(422);
    });

    it('assigns only to assignable employees of the task branch (transactionally)', async () => {
      const task = await createTask(t.as);
      const denovOnly = await createEmployee(t.as, { primaryBranchId: t.denov.id });
      const noBranch = await t.as
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignedToId: denovOnly.id })
        .expect(409);
      expect(noBranch.body.code).toBe('TASK_ASSIGNEE_NO_BRANCH_ACCESS');

      const gone = await createEmployee(t.as);
      await t.as.delete(`/employees/${gone.id}`).expect(200);
      const terminated = await t.as
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignedToId: gone.id })
        .expect(409);
      expect(terminated.body.code).toBe('EMPLOYEE_NOT_ASSIGNABLE');

      const other = await setupTenant(ctx, 'Other Academy');
      const foreign = await createEmployee(other.as, { primaryBranchId: other.termiz.id });
      await t.as.patch(`/tasks/${task.id}/assign`).send({ assignedToId: foreign.id }).expect(404);

      // None of the failed attempts left an ASSIGNED history row.
      expect(await historyTypes(t.as, task.id)).toEqual(['CREATED']);

      const ok = await createEmployee(t.as);
      const assigned = await t.as
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignedToId: ok.id, note: 'Please handle' })
        .expect(200);
      expect(assigned.body.data.assignedToId).toBe(ok.id);
      await t.as.patch(`/tasks/${task.id}/assign`).send({ assignedToId: null }).expect(200);
      expect(await historyTypes(t.as, task.id)).toEqual(['CREATED', 'ASSIGNED', 'ASSIGNED']);
    });

    it('changes status with history, completedAt and reopen rules', async () => {
      const task = await createTask(t.as);

      await t.as.patch(`/tasks/${task.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);
      const done = await t.as
        .patch(`/tasks/${task.id}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
      expect(done.body.data.completedAt).not.toBeNull();

      const invalid = await t.as
        .patch(`/tasks/${task.id}/status`)
        .send({ status: 'BLOCKED' })
        .expect(400);
      expect(invalid.body.code).toBe('INVALID_STATUS_TRANSITION');
      const closed = await t.as.patch(`/tasks/${task.id}`).send({ title: 'New' }).expect(409);
      expect(closed.body.code).toBe('TASK_CLOSED');

      const reopened = await t.as
        .patch(`/tasks/${task.id}/status`)
        .send({ status: 'IN_PROGRESS', note: 'Parents did not answer' })
        .expect(200);
      expect(reopened.body.data.completedAt).toBeNull();

      await t.as
        .patch(`/tasks/${task.id}`)
        .send({ priority: 'URGENT', dueDate: hoursFromNow(5) })
        .expect(200);
      const types = await historyTypes(t.as, task.id);
      expect(types.slice(0, 4)).toEqual([
        'CREATED',
        'STATUS_CHANGED',
        'COMPLETED',
        'STATUS_CHANGED',
      ]);
      // Priority and deadline change in one transaction (same timestamp).
      expect(types.slice(4).sort()).toEqual(['DEADLINE_CHANGED', 'PRIORITY_CHANGED']);
    });

    it('comments record their author and appear in history', async () => {
      const task = await createTask(t.as);
      await t.as.post(`/tasks/${task.id}/comments`).send({ content: 'First' }).expect(201);
      await t.as.post(`/tasks/${task.id}/comments`).send({ content: 'Second' }).expect(201);

      const comments = await t.as.get(`/tasks/${task.id}/comments`).expect(200);
      expect((comments.body.data.items as { content: string }[]).map((c) => c.content)).toEqual([
        'First',
        'Second',
      ]);
      expect(comments.body.data.items[0].user.id).toBe(t.owner.id);
      expect(await historyTypes(t.as, task.id)).toEqual(['CREATED', 'COMMENTED', 'COMMENTED']);
    });

    it('overdue tasks are derived: past due and still open', async () => {
      await createTask(t.as, { title: 'No deadline' });
      const late = await createTask(t.as, { dueDate: hoursFromNow(-2) });
      const lateDone = await createTask(t.as, { dueDate: hoursFromNow(-2) });
      await createTask(t.as, { dueDate: hoursFromNow(24) });
      await t.as.patch(`/tasks/${lateDone.id}/status`).send({ status: 'COMPLETED' }).expect(200);

      const overdue = await t.as.get('/tasks/overdue').expect(200);
      expect(ids(overdue.body)).toEqual([late.id]);
      expect(overdue.body.data.items[0].isOverdue).toBe(true);
      // Not overdue: finished, future and undated tasks.
      const filtered = await t.as.get('/tasks?overdue=false').expect(200);
      expect(filtered.body.data.meta.total).toBe(3);
    });

    it('filters, searches and paginates tasks', async () => {
      await createTask(t.as, { title: 'Prepare exam', priority: 'HIGH' });
      await createTask(t.as, { title: 'Order books', priority: 'LOW' });
      await createTask(t.as, { title: 'Denov report', branchId: t.denov.id });

      const high = await t.as.get('/tasks?status=TODO&priority=HIGH').expect(200);
      expect(high.body.data.meta.total).toBe(1);
      const search = await t.as.get('/tasks?search=books').expect(200);
      expect(search.body.data.items[0].title).toBe('Order books');
      const denov = await t.as.get(`/tasks?branchId=${t.denov.id}`).expect(200);
      expect(denov.body.data.meta.total).toBe(1);
      const page = await t.as.get('/tasks?limit=2&page=2').expect(200);
      expect(page.body.data.meta).toMatchObject({ total: 3, totalPages: 2 });
      expect(page.body.data.items).toHaveLength(1);
    });

    it('soft-deletes tasks and keeps their history', async () => {
      const task = await createTask(t.as);
      await t.as.delete(`/tasks/${task.id}`).expect(200);
      await t.as.get(`/tasks/${task.id}`).expect(404);
      const list = await t.as.get('/tasks').expect(200);
      expect(list.body.data.meta.total).toBe(0);
      expect(await ctx.prisma.task.count()).toBe(1);
      expect(await ctx.prisma.taskActivity.count({ where: { taskId: task.id } })).toBe(2);
    });

    it('statistics: organization/branch counts and per-employee completion rate', async () => {
      const employee = await createEmployee(t.as);
      const a = await createTask(t.as, { assignedToId: employee.id });
      const b = await createTask(t.as, { assignedToId: employee.id });
      const c = await createTask(t.as, { assignedToId: employee.id, dueDate: hoursFromNow(-1) });
      await createTask(t.as, { branchId: t.denov.id });
      await t.as.patch(`/tasks/${a.id}/status`).send({ status: 'COMPLETED' }).expect(200);
      await t.as
        .patch(`/tasks/${b.id}/status`)
        .send({ status: 'CANCELLED', note: 'Not needed anymore' })
        .expect(200);
      await t.as
        .patch(`/tasks/${c.id}/status`)
        .send({ status: 'BLOCKED', note: 'Waiting for the parents' })
        .expect(200);

      const all = await t.as.get('/tasks/statistics').expect(200);
      expect(all.body.data).toEqual({
        total: 4,
        todo: 1,
        inProgress: 0,
        blocked: 1,
        completed: 1,
        cancelled: 1,
        overdue: 1,
      });
      const termiz = await t.as.get(`/tasks/statistics?branchId=${t.termiz.id}`).expect(200);
      expect(termiz.body.data.total).toBe(3);

      const mine = await t.as.get(`/tasks/statistics/employees/${employee.id}`).expect(200);
      expect(mine.body.data).toMatchObject({
        employeeId: employee.id,
        total: 3,
        completed: 1,
        blocked: 1,
        overdue: 1,
        completionRate: 50,
      });

      const fresh = await createEmployee(t.as);
      const none = await t.as.get(`/tasks/statistics/employees/${fresh.id}`).expect(200);
      expect(none.body.data).toMatchObject({ total: 0, completionRate: 0 });
    });

    it('staff see and move only their own tasks', async () => {
      const teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      const teacherEmployee = await createEmployee(t.as, { userId: teacher.user.id });
      const own = await createTask(t.as, { assignedToId: teacherEmployee.id });
      const others = await createTask(t.as);

      await teacher.as.post('/tasks').send({ title: 'X', branchId: t.termiz.id }).expect(403);
      const list = await teacher.as.get('/tasks').expect(200);
      expect(ids(list.body)).toEqual([own.id]);
      const denied = await teacher.as.get(`/tasks/${others.id}`).expect(403);
      expect(denied.body.code).toBe('TASK_ACCESS_DENIED');
      await teacher.as
        .patch(`/tasks/${others.id}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(403);

      await teacher.as.patch(`/tasks/${own.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);
      const cancel = await teacher.as
        .patch(`/tasks/${own.id}/status`)
        .send({ status: 'CANCELLED' })
        .expect(403);
      expect(cancel.body.code).toBe('TASK_ACCESS_DENIED');
      await teacher.as.patch(`/tasks/${own.id}/status`).send({ status: 'COMPLETED' }).expect(200);
      await teacher.as.post(`/tasks/${own.id}/comments`).send({ content: 'Done' }).expect(201);
      await teacher.as.patch(`/tasks/${own.id}`).send({ title: 'Mine now' }).expect(403);
      await teacher.as.patch(`/tasks/${own.id}/assign`).send({ assignedToId: null }).expect(403);
      await teacher.as.get('/tasks/statistics').expect(403);
      const mine = await teacher.as.get('/tasks?mine=true').expect(200);
      expect(mine.body.data.meta.total).toBe(1);
    });

    it('blocks other branches and other organizations', async () => {
      const task = await createTask(t.as);
      const denovManager = await memberOf(ctx, t, 'MANAGER', [t.denov.id]);

      const denied = await denovManager.as.get(`/tasks/${task.id}`).expect(403);
      expect(denied.body.code).toBe('BRANCH_ACCESS_DENIED');
      await denovManager.as
        .patch(`/tasks/${task.id}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(403);
      const list = await denovManager.as.get('/tasks').expect(200);
      expect(list.body.data.meta.total).toBe(0);
      await denovManager.as.post('/tasks').send({ title: 'X', branchId: t.termiz.id }).expect(403);

      const other = await setupTenant(ctx, 'Other Academy');
      const crossOrg = await other.as.get(`/tasks/${task.id}`).expect(404);
      expect(crossOrg.body.code).toBe('TASK_NOT_FOUND');
      await other.as.post(`/tasks/${task.id}/comments`).send({ content: 'x' }).expect(404);
    });
  });
});

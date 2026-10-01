import { randomUUID } from 'node:crypto';
import {
  addMember,
  createBranch,
  createOrganization,
  registerUser,
  type TestUser,
} from './factories';
import { type TestContext } from './test-app';

/** Authenticated request inside an organization context. */
export function api(ctx: TestContext, user: TestUser, organizationId: string, branchId?: string) {
  const withContext = (req: ReturnType<ReturnType<TestContext['http']>['get']>) => {
    req.auth(user.accessToken, { type: 'bearer' }).set('X-Organization-Id', organizationId);
    if (branchId) req.set('X-Branch-Id', branchId);
    return req;
  };
  return {
    get: (url: string) => withContext(ctx.http().get(url)),
    post: (url: string) => withContext(ctx.http().post(url)),
    patch: (url: string) => withContext(ctx.http().patch(url)),
    put: (url: string) => withContext(ctx.http().put(url)),
    delete: (url: string) => withContext(ctx.http().delete(url)),
  };
}

export type Api = ReturnType<typeof api>;

export interface Tenant {
  owner: TestUser;
  orgId: string;
  termiz: { id: string };
  denov: { id: string };
  as: Api;
}

/** Organization with two branches (TRM, DNV), owned by a fresh user. */
export async function setupTenant(ctx: TestContext, name = 'Jony Math Academy'): Promise<Tenant> {
  const owner = await registerUser(ctx, `Owner of ${name}`);
  const org = await createOrganization(ctx, owner, name);
  const termiz = await createBranch(ctx, owner, org.id, 'TRM');
  const denov = await createBranch(ctx, owner, org.id, 'DNV');
  return { owner, orgId: org.id, termiz, denov, as: api(ctx, owner, org.id) };
}

/** A member limited to the given branches. */
export async function memberOf(
  ctx: TestContext,
  tenant: Tenant,
  roleKey: string,
  branchIds: string[],
): Promise<{ user: TestUser; as: Api }> {
  const user = await registerUser(ctx, roleKey);
  await addMember(ctx, user.id, tenant.orgId, roleKey, branchIds);
  return { user, as: api(ctx, user, tenant.orgId) };
}

export async function createFamily(as: Api, branchId: string, name = 'Karimovlar oilasi') {
  const res = await as
    .post('/families')
    .send({ name, phone: '+998901234567', primaryBranchId: branchId })
    .expect(201);
  return res.body.data as { id: string; name: string };
}

export async function createStudent(
  as: Api,
  familyId: string,
  branchId: string,
  firstName = 'Ali',
) {
  const res = await as
    .post('/students')
    .send({ familyId, branchId, firstName, lastName: 'Karimov' })
    .expect(201);
  return res.body.data as { id: string; branchId: string; status: string };
}

export async function createCourse(as: Api, code = `C${randomUUID().slice(0, 6)}`) {
  const res = await as
    .post('/courses')
    .send({ name: `Course ${code}`, code, monthlyPrice: 450000 })
    .expect(201);
  return res.body.data as { id: string; code: string };
}

export async function createLevel(as: Api, courseId: string, code = 'F1') {
  const res = await as
    .post(`/courses/${courseId}/levels`)
    .send({ name: `Level ${code}`, code })
    .expect(201);
  return res.body.data as { id: string; courseId: string };
}

export async function createLead(
  as: Api,
  opts: {
    branchId?: string;
    name?: string;
    phone?: string;
    sourceId?: string;
    assignedToId?: string;
    priority?: string;
  } = {},
) {
  const res = await as
    .post('/leads')
    .send({
      name: opts.name ?? 'Dilnoza Karimova',
      phone: opts.phone ?? '+998901112233',
      branchId: opts.branchId,
      sourceId: opts.sourceId,
      assignedToId: opts.assignedToId,
      priority: opts.priority,
    })
    .expect(201);
  return res.body.data as {
    id: string;
    branchId: string;
    status: string;
    phone: string;
    assignedToId: string | null;
  };
}

/** The default lead source seeded on organization creation, by code. */
export async function defaultSource(
  ctx: TestContext,
  orgId: string,
  code = 'INSTAGRAM',
): Promise<{ id: string; code: string }> {
  const source = await ctx.prisma.leadSource.findFirstOrThrow({
    where: { organizationId: orgId, code },
    select: { id: true, code: true },
  });
  return source;
}

export async function createGroup(
  as: Api,
  opts: { branchId: string; courseId: string; levelId?: string; capacity?: number; name?: string },
) {
  const res = await as
    .post('/groups')
    .send({
      branchId: opts.branchId,
      courseId: opts.courseId,
      levelId: opts.levelId,
      name: opts.name ?? 'Group A',
      capacity: opts.capacity ?? 15,
      startDate: '2026-01-10',
    })
    .expect(201);
  return res.body.data as { id: string; branchId: string };
}

export function enroll(as: Api, studentId: string, groupId: string, startedAt = '2026-01-15') {
  return as.post('/enrollments').send({ studentId, groupId, startedAt });
}

export async function createTeacher(
  as: Api,
  branchId: string,
  extra: { userId?: string; firstName?: string } = {},
) {
  const res = await as
    .post('/teachers')
    .send({
      branchId,
      firstName: extra.firstName ?? 'Dilnoza',
      lastName: 'Rahimova',
      userId: extra.userId,
    })
    .expect(201);
  return res.body.data as { id: string; branchId: string };
}

export async function createRoom(as: Api, branchId: string, code = '101', capacity = 16) {
  const res = await as
    .post('/rooms')
    .send({ branchId, name: `Room ${code}`, code, capacity })
    .expect(201);
  return res.body.data as { id: string; branchId: string };
}

export function addSchedule(
  as: Api,
  groupId: string,
  slot: { dayOfWeek?: string; startTime?: string; endTime?: string; roomId?: string | null } = {},
) {
  return as.post(`/groups/${groupId}/schedules`).send({
    dayOfWeek: slot.dayOfWeek ?? 'MONDAY',
    startTime: slot.startTime ?? '18:30',
    endTime: slot.endTime ?? '20:00',
    ...(slot.roomId !== undefined && { roomId: slot.roomId }),
  });
}

/** A TEACHER-role member with a linked teacher profile (can log in and see own groups). */
export async function teacherWithLogin(
  ctx: TestContext,
  tenant: Tenant,
  branchId: string,
  firstName = 'Teacher',
) {
  const member = await memberOf(ctx, tenant, 'TEACHER', [branchId]);
  const profile = await createTeacher(tenant.as, branchId, { userId: member.user.id, firstName });
  return { ...member, teacherId: profile.id };
}

import { CenterStatus, PlatformRole } from '@prisma/client';
import { BackgroundTasks } from '../src/common/events/background-tasks';
import { CenterLifecycleService } from '../src/platform/center-lifecycle.service';
import { api, type Api, memberOf, setupTenant } from './utils/academic';
import { PASSWORD, registerUser, type TestUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

/**
 * Management hierarchy: platform OWNER → Center → Sub-Center → Branch, the
 * center lifecycle (frozen / expired), directors with temporary passwords,
 * staff that can't escalate, and isolation between centers.
 */
describe('Management hierarchy (e2e)', () => {
  let ctx: TestContext;
  let owner: TestUser;

  const asUser = (token: string) => ({
    get: (url: string) => ctx.http().get(url).auth(token, { type: 'bearer' }),
    post: (url: string) => ctx.http().post(url).auth(token, { type: 'bearer' }),
    patch: (url: string) => ctx.http().patch(url).auth(token, { type: 'bearer' }),
    delete: (url: string) => ctx.http().delete(url).auth(token, { type: 'bearer' }),
  });
  const ownerApi = () => asUser(owner.accessToken);
  const login = (loginName: string, password: string) =>
    ctx.http().post('/auth/login').send({ login: loginName, password });
  const today = () => new Date().toISOString().slice(0, 10);
  const daysFromNow = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const settle = () => ctx.app.get(BackgroundTasks).idle();

  /** Signs a new director in and replaces the temporary password; returns a center-scoped client. */
  async function activateDirector(loginName: string, temporaryPassword: string, centerId: string) {
    const first = await login(loginName, temporaryPassword).expect(200);
    const token = first.body.data.tokens.accessToken as string;
    await asUser(token)
      .post('/auth/change-password')
      .send({ currentPassword: temporaryPassword, newPassword: PASSWORD })
      .expect(200);
    const user = {
      id: first.body.data.user.id as string,
      email: loginName,
      accessToken: token,
      refreshToken: first.body.data.tokens.refreshToken as string,
    };
    return { user, as: api(ctx, user, centerId) };
  }

  async function createCenter(name: string, extra: Record<string, unknown> = {}) {
    const res = await ownerApi()
      .post('/owner/centers')
      .send({
        name,
        primaryColor: '#38b266',
        director: {
          name: `${name} Director`,
          email: `director.${Date.now()}@${name.toLowerCase().replace(/\W+/g, '')}.uz`,
        },
        ...extra,
      })
      .expect(201);
    return res.body.data as {
      center: { id: string; slug: string; status: string; availability: string };
      director: {
        director: { id: string; user: { id: string } };
        login: string;
        temporaryPassword: string;
      };
    };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    owner = await registerUser(ctx, 'Platform Owner');
    await ctx.prisma.user.update({
      where: { id: owner.id },
      data: { platformRole: PlatformRole.OWNER },
    });
  });
  afterAll(() => ctx.app.close());

  describe('Owner', () => {
    it('only the platform owner reaches /owner/*', async () => {
      const someone = await registerUser(ctx, 'Not an owner');
      const res = await asUser(someone.accessToken).get('/owner/centers').expect(403);
      expect(res.body.code).toBe('PLATFORM_ACCESS_DENIED');
      await ownerApi().get('/owner/centers').expect(200);
      const me = await ownerApi().get('/auth/me').expect(200);
      expect(me.body.data.platformRole).toBe('OWNER');
    });

    it('creates a center with brand, activation period and a director (temporary password once)', async () => {
      const { center, director } = await createCenter('Jony', {
        slug: 'jony',
        secondaryColor: '#0ea5e9',
        activeFrom: today(),
        activeUntil: daysFromNow(365),
      });
      expect(center).toMatchObject({ slug: 'jony', status: 'ACTIVE', availability: 'ACTIVE' });
      expect(director.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);

      // Only a hash is stored, and the account must change the password.
      const stored = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: director.director.user.id },
      });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored.passwordHash).not.toContain(director.temporaryPassword);
      expect(stored.mustChangePassword).toBe(true);

      // First sign-in: everything but the account routes is closed until the password changes.
      const first = await login(director.login, director.temporaryPassword).expect(200);
      const token = first.body.data.tokens.accessToken as string;
      const blocked = await api(ctx, { ...owner, accessToken: token }, center.id)
        .get('/students')
        .expect(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      await asUser(token)
        .post('/auth/change-password')
        .send({ currentPassword: 'wrong-password', newPassword: PASSWORD })
        .expect(400);
      await asUser(token)
        .post('/auth/change-password')
        .send({ currentPassword: director.temporaryPassword, newPassword: PASSWORD })
        .expect(200);
      const context = await asUser(token).get(`/organizations/${center.id}/context`).expect(200);
      expect(context.body.data.membership).toMatchObject({ role: 'DIRECTOR', tier: 'DIRECTOR' });

      // Neither the response nor the audit trail ever contains the password.
      await settle();
      const audit = await ctx.prisma.auditLog.findMany({ where: { organizationId: center.id } });
      expect(JSON.stringify(audit)).not.toContain(director.temporaryPassword);
      expect(audit.map((row) => row.action)).toEqual(
        expect.arrayContaining(['CENTER_CREATED', 'DIRECTOR_CREATED']),
      );
    });

    it('freezes a center: members are locked out (reads, writes, sign-in); the owner can reactivate it', async () => {
      const { center, director } = await createCenter('Frozen Academy');
      const { as, user } = await activateDirector(
        director.login,
        director.temporaryPassword,
        center.id,
      );
      await as
        .post(`/organizations/${center.id}/branches`)
        .send({ name: 'Main', code: 'MAIN' })
        .expect(201);

      const frozen = await ownerApi()
        .post(`/owner/centers/${center.id}/freeze`)
        .send({ reason: 'Unpaid subscription' })
        .expect(201);
      expect(frozen.body.data).toMatchObject({ status: 'FROZEN', availability: 'FROZEN' });

      const read = await as.get('/students').expect(403);
      expect(read.body.code).toBe('CENTER_FROZEN');
      const write = await as
        .post('/families')
        .send({ name: 'X', phone: '+998901112233' })
        .expect(403);
      expect(write.body.code).toBe('CENTER_FROZEN');
      const signIn = await login(user.email, PASSWORD).expect(403);
      expect(signIn.body.code).toBe('CENTER_FROZEN');

      // The owner still sees it, and a frozen center can't be frozen twice.
      await ownerApi().get(`/owner/centers/${center.id}`).expect(200);
      await ownerApi().post(`/owner/centers/${center.id}/freeze`).send({}).expect(409);

      const active = await ownerApi()
        .post(`/owner/centers/${center.id}/activate`)
        .send({})
        .expect(201);
      expect(active.body.data.availability).toBe('ACTIVE');
      await login(user.email, PASSWORD).expect(200);
      await as.get('/students').expect(200);

      await settle();
      const actions = (
        await ctx.prisma.auditLog.findMany({ where: { organizationId: center.id } })
      ).map((row) => row.action);
      expect(actions).toEqual(expect.arrayContaining(['CENTER_FROZEN', 'CENTER_ACTIVATED']));
    });

    it('an expired center refuses mutations, is frozen by the sweep, and needs a new period to reopen', async () => {
      const { center, director } = await createCenter('Expiring Academy');
      const { as } = await activateDirector(director.login, director.temporaryPassword, center.id);

      await ownerApi()
        .patch(`/owner/centers/${center.id}`)
        .send({ activeFrom: daysFromNow(-60), activeUntil: daysFromNow(-1) })
        .expect(200);
      const res = await as
        .post('/families')
        .send({ name: 'Late', phone: '+998901112244' })
        .expect(403);
      expect(res.body.code).toBe('CENTER_EXPIRED');

      const frozenIds = await ctx.app.get(CenterLifecycleService).freezeExpired();
      expect(frozenIds).toContain(center.id);
      const stored = await ctx.prisma.organization.findUniqueOrThrow({ where: { id: center.id } });
      expect(stored.status).toBe(CenterStatus.FROZEN);
      const expiredAudit = await ctx.prisma.auditLog.findFirst({
        where: { organizationId: center.id, action: 'CENTER_EXPIRED' },
      });
      expect(expiredAudit?.userId).toBeNull(); // system action

      const reopen = await ownerApi()
        .post(`/owner/centers/${center.id}/activate`)
        .send({})
        .expect(400);
      expect(reopen.body.code).toBe('CENTER_PERIOD_ENDED');
      await ownerApi()
        .post(`/owner/centers/${center.id}/activate`)
        .send({ activeUntil: daysFromNow(30) })
        .expect(201);
      await as.post('/families').send({ name: 'Back', phone: '+998901112255' }).expect(201);
    });

    it('a center whose period has not started yet is closed too', async () => {
      const { center, director } = await createCenter('Future Academy', {
        activeFrom: daysFromNow(10),
      });
      const first = await login(director.login, director.temporaryPassword).expect(403);
      expect(first.body.code).toBe('CENTER_NOT_STARTED');
      const me = await ctx.prisma.organization.findUniqueOrThrow({ where: { id: center.id } });
      expect(me.status).toBe(CenterStatus.ACTIVE);
    });

    it('creates a director for an existing account, changes the director permissions and resets the password', async () => {
      const { center } = await createCenter('Second Center');
      const existing = await registerUser(ctx, 'Existing Person');
      const created = await ownerApi()
        .post('/owner/directors')
        .send({ centerId: center.id, name: 'Existing Person', email: existing.email })
        .expect(201);
      // An existing account is linked as is: no temporary password, password untouched.
      expect(created.body.data.temporaryPassword).toBeNull();
      const directorId = created.body.data.director.id as string;
      const as = api(ctx, existing, center.id);
      await as.get('/reports/finance/summary').expect(200);

      const narrowed = await ownerApi()
        .patch(`/owner/directors/${directorId}`)
        .send({ permissions: ['students.read', 'families.read'] })
        .expect(200);
      expect(narrowed.body.data.permissions).toEqual(
        expect.arrayContaining(['students.read', 'families.read', 'organization.read']),
      );
      await as.get('/students').expect(200);
      const denied = await as.get('/reports/finance/summary').expect(403);
      expect(denied.body.code).toBe('PERMISSION_DENIED');

      await ownerApi()
        .patch(`/owner/directors/${directorId}`)
        .send({ permissions: null })
        .expect(200);
      await as.get('/reports/finance/summary').expect(200);

      const reset = await ownerApi()
        .post(`/owner/directors/${directorId}/reset-password`)
        .expect(201);
      expect(reset.body.data.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
      await login(existing.email, PASSWORD).expect(401); // old password is gone
      await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: existing.refreshToken })
        .expect(401);

      await settle();
      const actions = (
        await ctx.prisma.auditLog.findMany({ where: { organizationId: center.id } })
      ).map((row) => row.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'DIRECTOR_CREATED',
          'DIRECTOR_PERMISSIONS_CHANGED',
          'DIRECTOR_PASSWORD_RESET',
        ]),
      );
    });

    it('archives instead of deleting: the history stays and members no longer see the center', async () => {
      const { center, director } = await createCenter('Archived Academy');
      const { as, user } = await activateDirector(
        director.login,
        director.temporaryPassword,
        center.id,
      );
      await as.post('/families').send({ name: 'Kept', phone: '+998901112266' }).expect(201);
      await ownerApi().post(`/owner/centers/${center.id}/archive`).expect(201);

      expect(await ctx.prisma.family.count({ where: { organizationId: center.id } })).toBe(1);
      const me = await asUser(user.accessToken).get('/auth/me').expect(200);
      expect(me.body.data.organizations).toEqual([]);
      await as.get('/families').expect(403);
      const list = await ownerApi().get('/owner/centers?status=ARCHIVED').expect(200);
      expect((list.body.data.items as { id: string }[]).map((c) => c.id)).toContain(center.id);
    });

    it('global analytics: center counts, totals and a row per center, aggregated server-side', async () => {
      const res = await ownerApi().get('/owner/analytics?period=month').expect(200);
      const data = res.body.data;
      expect(data.centers.total).toBe(data.rows.length);
      expect(data.centers.archived).toBeGreaterThanOrEqual(1);
      expect(data.totals).toHaveProperty('revenue');
      expect(data.rows[0].metrics).toHaveProperty('attendanceRate');

      const audit = await ownerApi().get('/owner/audit?limit=100').expect(200);
      expect((audit.body.data.items as { action: string }[]).map((row) => row.action)).toEqual(
        expect.arrayContaining(['CENTER_CREATED', 'CENTER_FROZEN', 'CENTER_ARCHIVED']),
      );
    });
  });

  describe('Permanent deletion', () => {
    it('deletes only archived centers, after a typed confirmation, with all their data', async () => {
      const { center, director } = await createCenter('Doomed Academy', { slug: 'doomed-academy' });
      const { as } = await activateDirector(director.login, director.temporaryPassword, center.id);
      const branch = await as
        .post(`/organizations/${center.id}/branches`)
        .send({ name: 'Main', code: 'MAIN' })
        .expect(201);
      await as.post('/sub-centers').send({ name: 'Kids', code: 'KIDS' }).expect(201);
      const family = await as
        .post('/families')
        .send({ name: 'Gone family', phone: '+998901110000', primaryBranchId: branch.body.data.id })
        .expect(201);
      await as
        .post('/students')
        .send({
          familyId: family.body.data.id,
          branchId: branch.body.data.id,
          firstName: 'A',
          lastName: 'B',
        })
        .expect(201);
      // Someone who also works in another center must survive the deletion.
      const other = await createCenter('Survivor Academy');
      const shared = await registerUser(ctx, 'Shared Person');
      for (const centerId of [center.id, other.center.id]) {
        await ownerApi()
          .post('/owner/directors')
          .send({ centerId, name: 'Shared Person', email: shared.email })
          .expect(201);
      }

      // Not archived yet → refused.
      const active = await ownerApi()
        .delete(`/owner/centers/${center.id}`)
        .send({ confirm: 'doomed-academy' })
        .expect(409);
      expect(active.body.code).toBe('CENTER_NOT_ARCHIVED');
      await ownerApi().post(`/owner/centers/${center.id}/archive`).expect(201);
      // Wrong confirmation → refused.
      const wrong = await ownerApi()
        .delete(`/owner/centers/${center.id}`)
        .send({ confirm: 'something-else' })
        .expect(400);
      expect(wrong.body.code).toBe('CONFIRMATION_MISMATCH');
      // Only the platform owner.
      await asUser(shared.accessToken)
        .delete(`/owner/centers/${center.id}`)
        .send({ confirm: 'doomed-academy' })
        .expect(403);

      const res = await ownerApi()
        .delete(`/owner/centers/${center.id}`)
        .send({ confirm: 'doomed-academy' })
        .expect(200);
      expect(res.body.data).toMatchObject({ id: center.id, deletedUsers: 1 }); // the center-only director

      expect(await ctx.prisma.organization.count({ where: { id: center.id } })).toBe(0);
      expect(await ctx.prisma.student.count({ where: { organizationId: center.id } })).toBe(0);
      expect(await ctx.prisma.branch.count({ where: { organizationId: center.id } })).toBe(0);
      expect(await ctx.prisma.user.count({ where: { id: director.director.user.id } })).toBe(0);
      expect(await ctx.prisma.user.count({ where: { id: shared.id } })).toBe(1);
      await ownerApi().get(`/owner/centers/${center.id}`).expect(404);
      // The history stays: the audit trail is append-only.
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { organizationId: center.id, action: 'CENTER_DELETED' },
      });
      expect(audit).toMatchObject({ userId: owner.id });
      expect(audit?.oldData).toMatchObject({ name: 'Doomed Academy', students: 1 });
    });

    it('bulk: archive several, then delete them with the count typed; each center is reported', async () => {
      const a = await createCenter('Bulk A');
      const b = await createCenter('Bulk B');
      const c = await createCenter('Bulk C');
      const ids = [a.center.id, b.center.id, c.center.id];

      const archived = await ownerApi()
        .post('/owner/centers/bulk')
        .send({ action: 'archive', ids: ids.slice(0, 2) })
        .expect(200);
      expect(archived.body.data).toMatchObject({ succeeded: 2, failed: 0 });

      await ownerApi()
        .post('/owner/centers/bulk')
        .send({ action: 'delete', ids, confirm: '2' })
        .expect(400);
      const deleted = await ownerApi()
        .post('/owner/centers/bulk')
        .send({ action: 'delete', ids, confirm: '3' })
        .expect(200);
      expect(deleted.body.data).toMatchObject({ succeeded: 2, failed: 1 });
      expect(deleted.body.data.results).toContainEqual({
        id: c.center.id,
        ok: false,
        code: 'CENTER_NOT_ARCHIVED',
      });
      expect(await ctx.prisma.organization.count({ where: { id: { in: ids } } })).toBe(1);
    });
  });

  describe('Director', () => {
    let center: { id: string };
    let director: { user: TestUser; as: Api };

    beforeAll(async () => {
      const created = await createCenter('Director Academy');
      center = created.center;
      director = await activateDirector(
        created.director.login,
        created.director.temporaryPassword,
        center.id,
      );
    });

    it('manages the own center: settings, brand (audited), sub-centers and branches', async () => {
      const as = director.as;
      await as
        .patch(`/organizations/${center.id}`)
        .send({ name: 'Director Academy', primaryColor: '#123456', address: 'Termiz' })
        .expect(200);

      const kids = await as
        .post('/sub-centers')
        .send({ name: 'Jony Kids English', code: 'kids' })
        .expect(201);
      expect(kids.body.data).toMatchObject({
        code: 'KIDS',
        slug: 'jony-kids-english',
        status: 'ACTIVE',
      });
      const math = await as
        .post('/sub-centers')
        .send({ name: 'Jony Math Academy', code: 'MATH' })
        .expect(201);
      await as.post('/sub-centers').send({ name: 'Duplicate', code: 'KIDS' }).expect(409);

      const b1 = await as
        .post(`/organizations/${center.id}/branches`)
        .send({ name: 'Kids 1', code: 'KE1', subCenterId: kids.body.data.id })
        .expect(201);
      expect(b1.body.data.subCenter).toMatchObject({
        id: kids.body.data.id,
        name: 'Jony Kids English',
      });
      await as
        .post(`/organizations/${center.id}/branches`)
        .send({ name: 'Math 1', code: 'MA1', subCenterId: math.body.data.id })
        .expect(201);
      const direct = await as
        .post(`/organizations/${center.id}/branches`)
        .send({ name: 'Head office', code: 'HQ' })
        .expect(201);
      expect(direct.body.data.subCenterId).toBeNull();

      const kidsBranches = await as
        .get(`/organizations/${center.id}/branches?subCenterId=${kids.body.data.id}`)
        .expect(200);
      expect((kidsBranches.body.data as { code: string }[]).map((b) => b.code)).toEqual(['KE1']);

      // Move a branch between sub-centers, then back under the center.
      await as
        .patch(`/branches/${b1.body.data.id}`)
        .send({ subCenterId: math.body.data.id })
        .expect(200);
      const moved = await as
        .patch(`/branches/${b1.body.data.id}`)
        .send({ subCenterId: null })
        .expect(200);
      expect(moved.body.data.subCenterId).toBeNull();
      await as
        .patch(`/branches/${b1.body.data.id}`)
        .send({ subCenterId: kids.body.data.id })
        .expect(200);

      await settle();
      const actions = (
        await ctx.prisma.auditLog.findMany({ where: { organizationId: center.id } })
      ).map((row) => row.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'BRAND_SETTINGS_CHANGED',
          'SUB_CENTER_CREATED',
          'BRANCH_CREATED',
          'BRANCH_UPDATED',
        ]),
      );
    });

    it('a frozen sub-center closes its branches; reactivating opens them again', async () => {
      const as = director.as;
      const subCenters = await as.get('/sub-centers').expect(200);
      const kids = (
        subCenters.body.data as { id: string; code: string; branches: { id: string }[] }[]
      ).find((s) => s.code === 'KIDS')!;
      const branchId = kids.branches[0].id;
      await as.post(`/sub-centers/${kids.id}/status`).send({ status: 'FROZEN' }).expect(201);

      const inBranch = api(ctx, director.user, center.id, branchId);
      const denied = await inBranch.get('/students').expect(403);
      expect(denied.body.code).toBe('BRANCH_ACCESS_DENIED');
      const context = await as.get(`/organizations/${center.id}/context`).expect(200);
      expect((context.body.data.branches as { id: string }[]).map((b) => b.id)).not.toContain(
        branchId,
      );

      await as.post(`/sub-centers/${kids.id}/status`).send({ status: 'ACTIVE' }).expect(201);
      await inBranch.get('/students').expect(200);
    });

    it('center analytics by sub-center and branch, with filters', async () => {
      const as = director.as;
      const branches = await as.get(`/organizations/${center.id}/branches`).expect(200);
      const ke1 = (branches.body.data as { id: string; code: string }[]).find(
        (b) => b.code === 'KE1',
      )!;
      const family = await as
        .post('/families')
        .send({ name: 'Analytics family', phone: '+998901119999', primaryBranchId: ke1.id })
        .expect(201);
      await as
        .post('/students')
        .send({
          familyId: family.body.data.id,
          branchId: ke1.id,
          firstName: 'Ali',
          lastName: 'Valiyev',
        })
        .expect(201);

      const res = await as.get('/analytics/center?period=month').expect(200);
      const data = res.body.data;
      expect(data.totals.activeStudents).toBe(1);
      const kidsRow = (data.subCenters as { id: string; code: string }[]).find(
        (s) => s.code === 'KIDS',
      )!;
      expect(kidsRow).toMatchObject({ branchCount: 1, metrics: { activeStudents: 1 } });
      const headOffice = (data.subCenters as { id: string | null }[]).find((s) => s.id === null);
      expect(headOffice).toMatchObject({ branchCount: 1, metrics: { activeStudents: 0 } });
      expect(data.branches).toHaveLength(3);

      const filtered = await as.get(`/analytics/center?subCenterId=${kidsRow.id}`).expect(200);
      expect(filtered.body.data.subCenters).toHaveLength(1);
      expect((filtered.body.data.branches as { code: string }[]).map((b) => b.code)).toEqual([
        'KE1',
      ]);

      // The owner sees the same numbers for this center.
      const owners = await ownerApi().get(`/owner/centers/${center.id}/analytics`).expect(200);
      expect(owners.body.data.totals.activeStudents).toBe(1);
    });

    it('adds staff without escalation: staff roles only, own branches, temporary password', async () => {
      const as = director.as;
      const roles = await as.get(`/organizations/${center.id}/roles`).expect(200);
      expect((roles.body.data as { key: string }[]).map((r) => r.key)).not.toContain('DIRECTOR');

      const branches = await as.get(`/organizations/${center.id}/branches`).expect(200);
      const ma1 = (branches.body.data as { id: string; code: string }[]).find(
        (b) => b.code === 'MA1',
      )!;
      const created = await as
        .post(`/organizations/${center.id}/staff`)
        .send({
          name: 'Math Manager',
          email: 'math.manager@director.uz',
          roleKey: 'MANAGER',
          branchIds: [ma1.id],
        })
        .expect(201);
      expect(created.body.data.member).toMatchObject({
        role: 'MANAGER',
        tier: 'STAFF',
        allBranches: false,
      });
      expect(created.body.data.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);

      const directorRole = await as
        .post(`/organizations/${center.id}/staff`)
        .send({
          name: 'Second director',
          email: 'second@director.uz',
          roleKey: 'DIRECTOR',
          allBranches: true,
        })
        .expect(422);
      expect(directorRole.body.code).toBe('VALIDATION_ERROR');

      // A director can't edit themself through the staff API.
      const self = await as.get(`/organizations/${center.id}/staff?search=Director`).expect(200);
      const selfId = (self.body.data.items as { id: string; tier: string }[]).find(
        (m) => m.tier === 'DIRECTOR',
      )!.id;
      const res = await as
        .patch(`/organizations/${center.id}/staff/${selfId}`)
        .send({ status: 'SUSPENDED' })
        .expect(403);
      expect(res.body.code).toBe('ROLE_NOT_ASSIGNABLE');
    });
  });

  describe('Scope isolation', () => {
    it('a director cannot reach another center by id, header, sub-center or branch', async () => {
      const a = await createCenter('Center A');
      const b = await createCenter('Center B');
      const dirA = await activateDirector(
        a.director.login,
        a.director.temporaryPassword,
        a.center.id,
      );
      const dirB = await activateDirector(
        b.director.login,
        b.director.temporaryPassword,
        b.center.id,
      );
      const subB = await dirB.as
        .post('/sub-centers')
        .send({ name: 'B Kids', code: 'BK' })
        .expect(201);
      const branchB = await dirB.as
        .post(`/organizations/${b.center.id}/branches`)
        .send({ name: 'B1', code: 'B1' })
        .expect(201);

      // Another center's id in the header or URL.
      const intoB = api(ctx, dirA.user, b.center.id);
      expect((await intoB.get('/students').expect(403)).body.code).toBe(
        'ORGANIZATION_ACCESS_DENIED',
      );
      await intoB.get('/sub-centers').expect(403);
      await asUser(dirA.user.accessToken).get(`/organizations/${b.center.id}/context`).expect(403);
      await intoB.get('/analytics/center').expect(403);

      // Another center's records through my own center: not found.
      await dirA.as.get(`/sub-centers/${subB.body.data.id}`).expect(404);
      await dirA.as
        .post(`/sub-centers/${subB.body.data.id}/status`)
        .send({ status: 'FROZEN' })
        .expect(404);
      await dirA.as
        .post(`/organizations/${a.center.id}/branches`)
        .send({ name: 'Sneaky', code: 'SNK', subCenterId: subB.body.data.id })
        .expect(404);
      await dirA.as.get(`/branches/${branchB.body.data.id}`).expect(404);
      await dirA.as.get(`/analytics/center?subCenterId=${subB.body.data.id}`).expect(404);
      // A foreign branch as X-Branch-Id.
      await api(ctx, dirA.user, a.center.id, branchB.body.data.id).get('/students').expect(403);

      // Directors never reach the owner area.
      await asUser(dirA.user.accessToken).get('/owner/centers').expect(403);
      await asUser(dirA.user.accessToken)
        .post(`/owner/centers/${b.center.id}/freeze`)
        .send({})
        .expect(403);
    });

    it('staff cannot do what their role does not allow', async () => {
      const tenant = await setupTenant(ctx, 'Staff Academy');
      const cashier = await memberOf(ctx, tenant, 'CASHIER', [tenant.termiz.id]);
      const hr = await memberOf(ctx, tenant, 'HR', [tenant.termiz.id]);

      expect(
        (await cashier.as.post('/sub-centers').send({ name: 'X', code: 'X' }).expect(403)).body
          .code,
      ).toBe('PERMISSION_DENIED');
      await cashier.as.get('/analytics/center').expect(403);
      await cashier.as
        .post(`/organizations/${tenant.orgId}/branches`)
        .send({ name: 'X', code: 'X' })
        .expect(403);
      await cashier.as
        .patch(`/organizations/${tenant.orgId}`)
        .send({ primaryColor: '#000000' })
        .expect(403);

      // HR may add staff, but never a role that grants more than HR has (e.g. ADMIN, CASHIER).
      for (const roleKey of ['ADMIN', 'CASHIER']) {
        const res = await hr.as
          .post(`/organizations/${tenant.orgId}/staff`)
          .send({
            name: 'Wannabe',
            email: `wannabe.${roleKey}@staff.uz`,
            roleKey,
            branchIds: [tenant.termiz.id],
          })
          .expect(403);
        expect(res.body.code).toBe('ROLE_NOT_ASSIGNABLE');
      }
      const hrRoles = await hr.as.get(`/organizations/${tenant.orgId}/roles`).expect(200);
      expect(
        (hrRoles.body.data as { key: string; assignable: boolean }[]).find(
          (r) => r.key === 'CASHIER',
        )?.assignable,
      ).toBe(false);

      // An admin limited to one branch staffs only that branch.
      const admin = await memberOf(ctx, tenant, 'ADMIN', [tenant.termiz.id]);
      const outside = await admin.as
        .post(`/organizations/${tenant.orgId}/staff`)
        .send({
          name: 'Other branch',
          email: 'other@staff.uz',
          roleKey: 'TEACHER',
          branchIds: [tenant.denov.id],
        })
        .expect(403);
      expect(outside.body.code).toBe('BRANCH_ACCESS_DENIED');
      await admin.as
        .post(`/organizations/${tenant.orgId}/staff`)
        .send({
          name: 'Everywhere',
          email: 'everywhere@staff.uz',
          roleKey: 'TEACHER',
          allBranches: true,
        })
        .expect(403);
      const teacher = await admin.as
        .post(`/organizations/${tenant.orgId}/staff`)
        .send({
          name: 'Teacher',
          email: 'teacher@staff.uz',
          roleKey: 'TEACHER',
          branchIds: [tenant.termiz.id],
        })
        .expect(201);
      // …and can't touch people working outside their branches (here: the all-branch director).
      const staff = await admin.as.get(`/organizations/${tenant.orgId}/staff`).expect(200);
      const director = (staff.body.data.items as { id: string; tier: string }[]).find(
        (m) => m.tier === 'DIRECTOR',
      )!;
      await admin.as
        .patch(`/organizations/${tenant.orgId}/staff/${director.id}`)
        .send({ status: 'SUSPENDED' })
        .expect(403);
      // A temporary password can be re-issued only for center-only accounts.
      await admin.as
        .post(`/organizations/${tenant.orgId}/staff/${teacher.body.data.member.id}/reset-password`)
        .expect(201);
    });

    it('a self-service center creator is its director, and the owner area stays closed to them', async () => {
      const tenant = await setupTenant(ctx, 'Self Service Academy');
      const context = await tenant.as.get(`/organizations/${tenant.orgId}/context`).expect(200);
      expect(context.body.data.membership.tier).toBe('DIRECTOR');
      await api(ctx, tenant.owner, tenant.orgId).get('/sub-centers').expect(200);
      await asUser(tenant.owner.accessToken).get('/owner/analytics').expect(403);
    });
  });

  describe('Account', () => {
    it('profile: rename freely; a new login needs the current password', async () => {
      const user = await registerUser(ctx, 'Profile User');
      const as = asUser(user.accessToken);
      const renamed = await as.patch('/auth/me').send({ name: 'Renamed User' }).expect(200);
      expect(renamed.body.data.name).toBe('Renamed User');

      const without = await as.patch('/auth/me').send({ email: 'new.login@test.uz' }).expect(400);
      expect(without.body.code).toBe('INVALID_CURRENT_PASSWORD');
      await as
        .patch('/auth/me')
        .send({ email: 'new.login@test.uz', currentPassword: PASSWORD })
        .expect(200);
      await login('new.login@test.uz', PASSWORD).expect(200);
    });

    it('sessions: lists devices, signs out the others, a password change keeps only this one', async () => {
      const user = await registerUser(ctx, 'Session User');
      const second = await login(user.email, PASSWORD).expect(200);
      const as = asUser(user.accessToken);
      const sessions = await as.get('/auth/sessions').expect(200);
      expect(sessions.body.data).toHaveLength(2);
      expect((sessions.body.data as { current: boolean }[]).filter((s) => s.current)).toHaveLength(
        1,
      );

      await as.post('/auth/sessions/revoke-others').expect(200);
      await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: second.body.data.tokens.refreshToken })
        .expect(401);
      expect((await as.get('/auth/sessions').expect(200)).body.data).toHaveLength(1);

      const third = await login(user.email, PASSWORD).expect(200);
      await as
        .post('/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'another-strong-pass' })
        .expect(200);
      await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: third.body.data.tokens.refreshToken })
        .expect(401);
      await ctx.http().post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200);
    });
  });
});

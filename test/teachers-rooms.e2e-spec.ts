import {
  api,
  createRoom,
  createTeacher,
  memberOf,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { registerUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Teachers & Rooms (e2e)', () => {
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

  describe('teachers', () => {
    it('creates a teacher (branch defaults to X-Branch-Id) and updates it', async () => {
      const res = await api(ctx, t.owner, t.orgId, t.termiz.id)
        .post('/teachers')
        .send({ firstName: 'Dilnoza', lastName: 'Rahimova', phone: '+998 90 111 22 33' })
        .expect(201);
      expect(res.body.data).toMatchObject({
        organizationId: t.orgId,
        branchId: t.termiz.id,
        userId: null,
        phone: '+998901112233',
        status: 'ACTIVE',
        branch: { id: t.termiz.id },
      });

      const updated = await t.as
        .patch(`/teachers/${res.body.data.id}`)
        .send({ notes: 'IELTS 8.0', branchId: t.denov.id })
        .expect(200);
      expect(updated.body.data).toMatchObject({ notes: 'IELTS 8.0', branchId: t.denov.id });

      const deleted = await t.as.delete(`/teachers/${res.body.data.id}`).expect(200);
      expect(deleted.body.data.status).toBe('INACTIVE');
    });

    it('links a login only for organization members, once', async () => {
      const outsider = await registerUser(ctx, 'Outsider');
      const bad = await t.as
        .post('/teachers')
        .send({ branchId: t.termiz.id, firstName: 'A', lastName: 'B', userId: outsider.id })
        .expect(400);
      expect(bad.body.code).toBe('TEACHER_USER_NOT_MEMBER');

      const member = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      await createTeacher(t.as, t.termiz.id, { userId: member.user.id });
      const dup = await t.as
        .post('/teachers')
        .send({ branchId: t.termiz.id, firstName: 'A', lastName: 'B', userId: member.user.id })
        .expect(409);
      expect(dup.body.code).toBe('TEACHER_USER_TAKEN');
    });

    it('organization isolation', async () => {
      const teacher = await createTeacher(t.as, t.termiz.id);
      const other = await setupTenant(ctx, 'Other');
      expect((await other.as.get(`/teachers/${teacher.id}`).expect(404)).body.code).toBe(
        'TEACHER_NOT_FOUND',
      );
      await other.as.patch(`/teachers/${teacher.id}`).send({ firstName: 'Hacked' }).expect(404);
      expect((await other.as.get('/teachers').expect(200)).body.data.meta.total).toBe(0);
    });

    it('branch isolation', async () => {
      const termizTeacher = await createTeacher(t.as, t.termiz.id, { firstName: 'Termiz' });
      const denovTeacher = await createTeacher(t.as, t.denov.id, { firstName: 'Denov' });
      const manager = await memberOf(ctx, t, 'MANAGER', [t.termiz.id]);

      const list = await manager.as.get('/teachers').expect(200);
      expect((list.body.data.items as { id: string }[]).map((x) => x.id)).toEqual([
        termizTeacher.id,
      ]);
      expect((await manager.as.get(`/teachers/${denovTeacher.id}`).expect(403)).body.code).toBe(
        'BRANCH_ACCESS_DENIED',
      );
      await manager.as
        .post('/teachers')
        .send({ branchId: t.denov.id, firstName: 'X', lastName: 'Y' })
        .expect(403);
    });
  });

  describe('rooms', () => {
    it('creates a room; code is unique per branch', async () => {
      const room = await createRoom(t.as, t.termiz.id, '101');
      expect(room).toMatchObject({ branchId: t.termiz.id });

      const dup = await t.as
        .post('/rooms')
        .send({ branchId: t.termiz.id, name: 'Other 101', code: '101', capacity: 10 })
        .expect(409);
      expect(dup.body.code).toBe('ROOM_CODE_TAKEN');
      // Same code in another branch is fine.
      await createRoom(t.as, t.denov.id, '101');

      const res = await t.as.get(`/rooms?branchId=${t.termiz.id}`).expect(200);
      expect(res.body.data.meta.total).toBe(1);
    });

    it('branch isolation', async () => {
      const denovRoom = await createRoom(t.as, t.denov.id, '201');
      const manager = await memberOf(ctx, t, 'MANAGER', [t.termiz.id]);
      expect((await manager.as.get(`/rooms/${denovRoom.id}`).expect(403)).body.code).toBe(
        'BRANCH_ACCESS_DENIED',
      );
      expect((await manager.as.get('/rooms').expect(200)).body.data.meta.total).toBe(0);

      const other = await setupTenant(ctx, 'Other');
      expect((await other.as.get(`/rooms/${denovRoom.id}`).expect(404)).body.code).toBe(
        'ROOM_NOT_FOUND',
      );
    });
  });
});

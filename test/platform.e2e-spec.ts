import { createSwaggerDocument } from '../src/swagger';
import {
  createCourse,
  createFamily,
  createGroup,
  createStudent,
  enroll,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Platform: health, errors, security, docs, integrity (e2e)', () => {
  let ctx: TestContext;
  let t: Tenant;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    t = await setupTenant(ctx);
  });
  afterAll(() => ctx.app.close());

  describe('health', () => {
    it('reports API, database and Redis at /health (outside /api/v1), without internals', async () => {
      const res = await ctx.http().get('/health').expect(200);
      expect(res.body.data).toEqual({
        status: 'healthy',
        checks: { api: 'up', database: 'up', redis: 'disabled' }, // tests use the in-process queue
        uptimeSeconds: expect.any(Number) as number,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/localhost|postgres|5432|6379|password/i);
      await ctx.http().get('/health/../api/v1/health').expect(404);
    });
  });

  describe('request id', () => {
    it('generates, echoes, or replaces an invalid X-Request-ID', async () => {
      const generated = await ctx.http().get('/health');
      expect(generated.headers['x-request-id']).toMatch(UUID);
      const echoed = await ctx.http().get('/health').set('X-Request-ID', 'gateway-abc.123');
      expect(echoed.headers['x-request-id']).toBe('gateway-abc.123');
      const replaced = await ctx.http().get('/health').set('X-Request-ID', 'bad id; drop table');
      expect(replaced.headers['x-request-id']).toMatch(UUID);
    });
  });

  describe('errors', () => {
    it('uses one envelope and the right status codes, never internals', async () => {
      const notFound = await t.as.get('/no-such-route').expect(404);
      expect(Object.keys(notFound.body).sort()).toEqual(['code', 'message', 'success']);
      expect(notFound.body).toMatchObject({ success: false, code: 'NOT_FOUND' });

      await ctx.http().get('/students').expect(401);

      const invalid = await t.as.post('/families').send({ name: '' }).expect(422);
      expect(invalid.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
      expect(invalid.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
      );

      const malformed = await t.as
        .post('/families')
        .set('Content-Type', 'application/json')
        .send('{"name": ')
        .expect(400);
      expect(malformed.body).toEqual({
        success: false,
        message: 'Malformed JSON body',
        code: 'BAD_REQUEST',
      });

      // Pagination is capped: the database never sees limit=100000.
      await t.as.get('/students?limit=100000').expect(422);
      await t.as.get('/students?limit=100').expect(200);

      const bodies = JSON.stringify([notFound.body, invalid.body, malformed.body]);
      expect(bodies).not.toMatch(/stack|prisma|at \w+ \(|node_modules/i);
    });
  });

  describe('security', () => {
    it('sends hardening headers and a strict CORS policy', async () => {
      const res = await ctx.http().get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();

      const allowed = await ctx.http().get('/health').set('Origin', 'http://localhost:5173');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(allowed.headers['access-control-expose-headers']).toMatch(/x-request-id/i);
      const foreign = await ctx.http().get('/health').set('Origin', 'https://evil.example');
      expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('never returns password hashes or refresh token hashes', async () => {
      const me = await t.as.get('/auth/me').expect(200);
      const members = await t.as.get(`/organizations/${t.orgId}`).expect(200);
      expect(JSON.stringify([me.body, members.body])).not.toMatch(
        /passwordHash|tokenHash|\$argon2/,
      );
    });
  });

  describe('swagger', () => {
    it('documents every module under /api/v1 with bearer auth', () => {
      const document = createSwaggerDocument(ctx.app);
      const tags = new Set(
        Object.values(document.paths).flatMap((item) =>
          Object.values(item as Record<string, { tags?: string[] }>).flatMap((op) => op.tags ?? []),
        ),
      );
      for (const tag of [
        'Auth',
        'Organizations',
        'Branches',
        'Families',
        'Students',
        'Courses',
        'Groups',
        'Enrollments',
        'Attendance',
        'Finance · Invoices',
        'Leads',
        'HR · Employees',
        'Tasks',
        'Notifications',
        'Reports · Finance',
        'Reports · Students',
        'Audit',
        'Dashboard',
        'Health',
      ]) {
        expect({ tag, documented: tags.has(tag) }).toEqual({ tag, documented: true });
      }
      const paths = Object.keys(document.paths);
      expect(paths).toEqual(
        expect.arrayContaining([
          '/api/v1/auth/login',
          '/api/v1/reports/finance/summary',
          '/api/v1/dashboard/overview',
          '/api/v1/audit-logs',
          '/health',
        ]),
      );
      expect(paths.filter((p) => p !== '/health').every((p) => p.startsWith('/api/v1/'))).toBe(
        true,
      );
    });
  });

  describe('database integrity', () => {
    it('numbers concurrent invoices gap-free and unique', async () => {
      const family = await createFamily(t.as, t.termiz.id);
      const results = await Promise.all(
        Array.from({ length: 15 }, () =>
          t.as.post('/invoices').send({
            familyId: family.id,
            amount: 1000,
            dueDate: '2030-01-01',
            branchId: t.termiz.id,
          }),
        ),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      const numbers = results.map((r) =>
        Number((r.body.data.invoiceNumber as string).split('-')[2]),
      );
      expect(new Set(numbers).size).toBe(15);
      expect(Math.max(...numbers) - Math.min(...numbers)).toBe(14);
    });

    it('rolls back a failed multi-step write completely', async () => {
      // Lead conversion = family + student + enrollment in one transaction.
      const course = await createCourse(t.as);
      const group = await createGroup(t.as, {
        branchId: t.termiz.id,
        courseId: course.id,
        capacity: 1,
      });
      const family = await createFamily(t.as, t.termiz.id, 'Full group family');
      const occupant = await createStudent(t.as, family.id, t.termiz.id, 'Occupant');
      await enroll(t.as, occupant.id, group.id, '2026-09-01').expect(201);
      const [families, students] = await Promise.all([
        ctx.prisma.family.count(),
        ctx.prisma.student.count(),
      ]);

      const lead = await t.as
        .post('/leads')
        .send({ name: 'Too late', phone: '+998909998877', branchId: t.termiz.id })
        .expect(201);
      const full = await t.as
        .post(`/leads/${lead.body.data.id as string}/convert`)
        .send({ student: { firstName: 'No', lastName: 'Seat' }, groupId: group.id })
        .expect(409);
      expect(full.body.code).toBe('GROUP_CAPACITY_FULL');

      expect(await ctx.prisma.family.count()).toBe(families);
      expect(await ctx.prisma.student.count()).toBe(students);
      const leadAfter = await t.as.get(`/leads/${lead.body.data.id as string}`).expect(200);
      expect(leadAfter.body.data.status).toBe('NEW');
    });
  });
});

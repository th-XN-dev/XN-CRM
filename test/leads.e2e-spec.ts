import {
  createCourse,
  createGroup,
  createFamily,
  createLead,
  defaultSource,
  memberOf,
  setupTenant,
  type Tenant,
} from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Leads & CRM Sales (e2e)', () => {
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

  it('seeds default sources and a default pipeline on organization creation', async () => {
    const sources = await t.as.get('/lead-sources').expect(200);
    expect(sources.body.data.length).toBeGreaterThanOrEqual(9);

    const pipelines = await t.as.get('/lead-pipelines').expect(200);
    expect(pipelines.body.data).toHaveLength(1);
    expect(pipelines.body.data[0]).toMatchObject({ isDefault: true });
    expect(pipelines.body.data[0].stages.length).toBe(5);
  });

  it('creates a lead (branch defaults, status NEW) and normalizes the phone', async () => {
    const source = await defaultSource(ctx, t.orgId, 'TELEGRAM');
    const res = await t.as
      .post('/leads')
      .send({
        name: 'Aziz',
        phone: '+998 (90) 123-45-67',
        branchId: t.termiz.id,
        sourceId: source.id,
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      branchId: t.termiz.id,
      status: 'NEW',
      priority: 'MEDIUM',
      phone: '+998901234567',
      sourceId: source.id,
    });
  });

  it('rejects a duplicate active phone (different formats normalize equal)', async () => {
    await createLead(t.as, { branchId: t.termiz.id, phone: '+998901234567' });
    const res = await t.as
      .post('/leads')
      .send({ name: 'Someone else', phone: '90 123 45 67', branchId: t.termiz.id })
      .expect(409);
    expect(res.body).toMatchObject({ success: false, code: 'DUPLICATE_LEAD' });
  });

  it('allows the same phone again once the earlier lead is lost', async () => {
    const lead = await createLead(t.as, { branchId: t.termiz.id, phone: '+998901234567' });
    await t.as
      .patch(`/leads/${lead.id}/status`)
      .send({ status: 'LOST', reason: 'No answer' })
      .expect(200);
    await t.as
      .post('/leads')
      .send({ name: 'New attempt', phone: '+998901234567', branchId: t.termiz.id })
      .expect(201);
  });

  it('searches and filters leads with pagination', async () => {
    await createLead(t.as, { branchId: t.termiz.id, name: 'Ali Valiyev', phone: '+998901111111' });
    await createLead(t.as, { branchId: t.termiz.id, name: 'Vali Aliyev', phone: '+998902222222' });
    await createLead(t.as, { branchId: t.denov.id, name: 'Bobur', phone: '+998903333333' });

    const search = await t.as.get('/leads?search=ali').expect(200);
    expect(search.body.data.items.length).toBe(2);

    const byBranch = await t.as.get(`/leads?branchId=${t.denov.id}`).expect(200);
    expect(byBranch.body.data.items).toHaveLength(1);
    expect(byBranch.body.data.items[0].name).toBe('Bobur');

    const byPhone = await t.as.get('/leads?phone=902222222').expect(200);
    expect(byPhone.body.data.items).toHaveLength(1);

    const paged = await t.as.get('/leads?limit=2&page=1').expect(200);
    expect(paged.body.data.items).toHaveLength(2);
    expect(paged.body.data.meta).toMatchObject({ total: 3, totalPages: 2 });
  });

  it('changes status and records an activity, but refuses CONVERTED via /status', async () => {
    const lead = await createLead(t.as, { branchId: t.termiz.id });
    await t.as.patch(`/leads/${lead.id}/status`).send({ status: 'CONTACTED' }).expect(200);
    await t.as.patch(`/leads/${lead.id}/status`).send({ status: 'QUALIFIED' }).expect(200);

    const converted = await t.as
      .patch(`/leads/${lead.id}/status`)
      .send({ status: 'CONVERTED' })
      .expect(400);
    expect(converted.body.code).toBe('LEAD_NOT_CONVERTIBLE');

    const activities = await t.as.get(`/leads/${lead.id}/activities`).expect(200);
    const types = (activities.body.data.items as { type: string }[]).map((a) => a.type);
    expect(types).toContain('STATUS_CHANGED');
  });

  it('assigns a lead to a member and logs the activity', async () => {
    const manager = await memberOf(ctx, t, 'MANAGER', [t.termiz.id]);
    const lead = await createLead(t.as, { branchId: t.termiz.id });
    const res = await t.as
      .patch(`/leads/${lead.id}/assign`)
      .send({ assignedToId: manager.user.id })
      .expect(200);
    expect(res.body.data.assignedToId).toBe(manager.user.id);

    const activities = await t.as.get(`/leads/${lead.id}/activities`).expect(200);
    expect(
      (activities.body.data.items as { type: string }[]).some((a) => a.type === 'ASSIGNED'),
    ).toBe(true);
  });

  it('refuses to assign a lead to a member without access to its branch', async () => {
    const denovOnly = await memberOf(ctx, t, 'MANAGER', [t.denov.id]);
    const lead = await createLead(t.as, { branchId: t.termiz.id });
    const res = await t.as
      .patch(`/leads/${lead.id}/assign`)
      .send({ assignedToId: denovOnly.user.id })
      .expect(409);
    expect(res.body.code).toBe('LEAD_ASSIGNEE_NO_BRANCH_ACCESS');
  });

  it('lists follow-ups by window (overdue / upcoming)', async () => {
    const overdue = await createLead(t.as, { branchId: t.termiz.id, phone: '+998901111111' });
    const upcoming = await createLead(t.as, { branchId: t.termiz.id, phone: '+998902222222' });
    await t.as
      .patch(`/leads/${overdue.id}/follow-up`)
      .send({ nextFollowUpAt: '2020-01-01T09:00:00.000Z' })
      .expect(200);
    await t.as
      .patch(`/leads/${upcoming.id}/follow-up`)
      .send({ nextFollowUpAt: '2999-01-01T09:00:00.000Z' })
      .expect(200);

    const overdueList = await t.as.get('/leads/follow-ups?filter=overdue').expect(200);
    expect((overdueList.body.data.items as { id: string }[]).map((l) => l.id)).toEqual([
      overdue.id,
    ]);

    const upcomingList = await t.as.get('/leads/follow-ups?filter=upcoming').expect(200);
    expect((upcomingList.body.data.items as { id: string }[]).map((l) => l.id)).toEqual([
      upcoming.id,
    ]);

    const all = await t.as.get('/leads/follow-ups').expect(200);
    expect(all.body.data.meta.total).toBe(2);
  });

  it('logs manual activities but rejects system-only types', async () => {
    const lead = await createLead(t.as, { branchId: t.termiz.id });
    await t.as
      .post(`/leads/${lead.id}/activities`)
      .send({ type: 'CALL', note: 'Rang qildim' })
      .expect(201);
    await t.as.post(`/leads/${lead.id}/activities`).send({ type: 'STATUS_CHANGED' }).expect(422);
  });

  describe('conversion', () => {
    it('converts a lead into a new family, student and enrollment', async () => {
      const course = await createCourse(t.as);
      const group = await createGroup(t.as, { branchId: t.termiz.id, courseId: course.id });
      const lead = await createLead(t.as, {
        branchId: t.termiz.id,
        name: 'Karim',
        phone: '+998905550011',
      });

      const res = await t.as
        .post(`/leads/${lead.id}/convert`)
        .send({
          student: { firstName: 'Karim', lastName: 'Karimov', birthDate: '2015-03-10' },
          groupId: group.id,
        })
        .expect(201);

      expect(res.body.data.lead).toMatchObject({ status: 'CONVERTED' });
      expect(res.body.data.lead.convertedStudentId).toBe(res.body.data.student.id);
      expect(res.body.data.enrollmentId).toBeTruthy();

      // The lead now points to a real student, and they are distinct entities.
      const student = await ctx.prisma.student.findUniqueOrThrow({
        where: { id: res.body.data.student.id },
      });
      expect(student.branchId).toBe(t.termiz.id);

      const enrollment = await ctx.prisma.enrollment.findFirstOrThrow({
        where: { studentId: student.id },
      });
      expect(enrollment).toMatchObject({ groupId: group.id, status: 'ACTIVE' });
    });

    it('converts into an existing family when familyId is given', async () => {
      const family = await createFamily(t.as, t.termiz.id);
      const lead = await createLead(t.as, { branchId: t.termiz.id, phone: '+998905550022' });

      const res = await t.as
        .post(`/leads/${lead.id}/convert`)
        .send({ familyId: family.id, student: { firstName: 'Sara', lastName: 'Yusupova' } })
        .expect(201);
      expect(res.body.data.family.id).toBe(family.id);

      const student = await ctx.prisma.student.findUniqueOrThrow({
        where: { id: res.body.data.student.id },
      });
      expect(student.familyId).toBe(family.id);
    });

    it('prevents double conversion', async () => {
      const lead = await createLead(t.as, { branchId: t.termiz.id, phone: '+998905550033' });
      await t.as
        .post(`/leads/${lead.id}/convert`)
        .send({ student: { firstName: 'A', lastName: 'B' } })
        .expect(201);
      const second = await t.as
        .post(`/leads/${lead.id}/convert`)
        .send({ student: { firstName: 'A', lastName: 'B' } })
        .expect(409);
      expect(second.body.code).toBe('LEAD_ALREADY_CONVERTED');
    });
  });

  describe('tenant isolation & permissions', () => {
    it('returns 404 for a lead in another organization', async () => {
      const other = await setupTenant(ctx, 'Rival Academy');
      const lead = await createLead(other.as, { branchId: other.termiz.id });
      await t.as.get(`/leads/${lead.id}`).expect(404);
    });

    it('returns 403 for a lead outside the caller branches', async () => {
      const denovOnly = await memberOf(ctx, t, 'MANAGER', [t.denov.id]);
      const lead = await createLead(t.as, { branchId: t.termiz.id });
      await denovOnly.as.get(`/leads/${lead.id}`).expect(403);
    });

    it('denies leads access to teachers by default', async () => {
      const teacher = await memberOf(ctx, t, 'TEACHER', [t.termiz.id]);
      await teacher.as.get('/leads').expect(403);
    });
  });

  it('computes CRM statistics with safe division', async () => {
    const l1 = await createLead(t.as, { branchId: t.termiz.id, phone: '+998900000001' });
    const l2 = await createLead(t.as, { branchId: t.termiz.id, phone: '+998900000002' });
    await t.as.patch(`/leads/${l1.id}/status`).send({ status: 'QUALIFIED' }).expect(200);
    await t.as.patch(`/leads/${l2.id}/status`).send({ status: 'QUALIFIED' }).expect(200);
    await t.as
      .post(`/leads/${l1.id}/convert`)
      .send({ student: { firstName: 'X', lastName: 'Y' } })
      .expect(201);

    const stats = await t.as.get('/leads/stats').expect(200);
    expect(stats.body.data).toMatchObject({ totalLeads: 2, converted: 1, qualified: 1 });
    // converted (1) / reached-qualified (2) × 100 = 50
    expect(stats.body.data.conversionRate).toBe(50);
    // no trials booked → rate is 0, not NaN
    expect(stats.body.data.trialAttendanceRate).toBe(0);
  });

  it('trial attendance rate follows status history (converted leads keep their trial)', async () => {
    const attended = await createLead(t.as, { branchId: t.termiz.id, phone: '+998900000011' });
    const noShow = await createLead(t.as, { branchId: t.termiz.id, phone: '+998900000012' });
    const status = (id: string, value: string) =>
      t.as.patch(`/leads/${id}/status`).send({ status: value }).expect(200);
    await status(attended.id, 'TRIAL_BOOKED');
    await status(attended.id, 'TRIAL_ATTENDED');
    await t.as
      .post(`/leads/${attended.id}/convert`)
      .send({ student: { firstName: 'X', lastName: 'Y' } })
      .expect(201);
    await status(noShow.id, 'TRIAL_BOOKED');
    await status(noShow.id, 'LOST');

    const stats = await t.as.get('/leads/stats').expect(200);
    // attended 1 of the 2 booked trials
    expect(stats.body.data.trialAttendanceRate).toBe(50);
  });
});

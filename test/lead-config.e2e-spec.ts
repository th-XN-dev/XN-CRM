import { createLead, setupTenant, type Tenant } from './utils/academic';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Lead sources & pipelines (e2e)', () => {
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

  describe('sources', () => {
    it('creates a source (code upper-cased) and rejects a duplicate code', async () => {
      const res = await t.as
        .post('/lead-sources')
        .send({ name: 'Instagram Ads', code: 'insta_ads' })
        .expect(201);
      expect(res.body.data).toMatchObject({ code: 'INSTA_ADS', isActive: true });

      const dup = await t.as
        .post('/lead-sources')
        .send({ name: 'Another', code: 'INSTA_ADS' })
        .expect(409);
      expect(dup.body.code).toBe('LEAD_SOURCE_CODE_TAKEN');
    });

    it('deactivates a source (soft delete) and filters by isActive', async () => {
      const created = await t.as
        .post('/lead-sources')
        .send({ name: 'Billboards', code: 'BILLBOARDS' })
        .expect(201);
      await t.as.delete(`/lead-sources/${created.body.data.id}`).expect(200);

      const active = await t.as.get('/lead-sources?isActive=true').expect(200);
      expect((active.body.data as { code: string }[]).some((s) => s.code === 'BILLBOARDS')).toBe(
        false,
      );

      const inactive = await t.as.get('/lead-sources?isActive=false').expect(200);
      expect((inactive.body.data as { code: string }[]).some((s) => s.code === 'BILLBOARDS')).toBe(
        true,
      );
    });

    it('rejects an inactive source when creating a lead', async () => {
      const created = await t.as
        .post('/lead-sources')
        .send({ name: 'Old', code: 'OLD_SRC' })
        .expect(201);
      await t.as.delete(`/lead-sources/${created.body.data.id}`).expect(200);

      const res = await t.as
        .post('/leads')
        .send({
          name: 'X',
          phone: '+998901234567',
          branchId: t.termiz.id,
          sourceId: created.body.data.id,
        })
        .expect(409);
      expect(res.body.code).toBe('LEAD_SOURCE_INACTIVE');
    });
  });

  describe('pipelines & stages', () => {
    it('creates a pipeline and moves the default flag', async () => {
      const created = await t.as
        .post('/lead-pipelines')
        .send({ name: 'B2B Pipeline', isDefault: true })
        .expect(201);
      expect(created.body.data).toMatchObject({ isDefault: true });

      const all = await t.as.get('/lead-pipelines').expect(200);
      const defaults = (all.body.data as { id: string; isDefault: boolean }[]).filter(
        (p) => p.isDefault,
      );
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(created.body.data.id);
    });

    it('adds, updates and removes stages; rejects a duplicate stage code', async () => {
      const pipeline = await t.as.post('/lead-pipelines').send({ name: 'P' }).expect(201);
      const pid = pipeline.body.data.id;

      const stage = await t.as
        .post(`/lead-pipelines/${pid}/stages`)
        .send({ name: 'Demo', code: 'DEMO', order: 1 })
        .expect(201);
      await t.as
        .post(`/lead-pipelines/${pid}/stages`)
        .send({ name: 'Demo 2', code: 'DEMO' })
        .expect(409);

      await t.as
        .patch(`/lead-stages/${stage.body.data.id}`)
        .send({ name: 'Demo call' })
        .expect(200);
      await t.as.delete(`/lead-stages/${stage.body.data.id}`).expect(200);
    });

    it('blocks deleting a stage that still has leads', async () => {
      const pipeline = await t.as.post('/lead-pipelines').send({ name: 'P' }).expect(201);
      const stage = await t.as
        .post(`/lead-pipelines/${pipeline.body.data.id}/stages`)
        .send({ name: 'Intro', code: 'INTRO' })
        .expect(201);
      const lead = await createLead(t.as, { branchId: t.termiz.id });
      await t.as.patch(`/leads/${lead.id}`).send({ stageId: stage.body.data.id }).expect(200);

      const res = await t.as.delete(`/lead-stages/${stage.body.data.id}`).expect(409);
      expect(res.body.code).toBe('LEAD_STAGE_HAS_LEADS');
    });

    it('404s for a pipeline of another organization', async () => {
      const other = await setupTenant(ctx, 'Other Co');
      const otherPipeline = await other.as.get('/lead-pipelines').expect(200);
      await t.as.get(`/lead-pipelines/${otherPipeline.body.data[0].id}`).expect(404);
    });
  });
});

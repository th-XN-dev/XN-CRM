import { createOrganization, PASSWORD, registerUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestContext } from './utils/test-app';

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDatabase(ctx.prisma));
  afterAll(() => ctx.app.close());

  describe('POST /auth/register', () => {
    it('creates a user, hashes the password and returns a token pair', async () => {
      const res = await ctx
        .http()
        .post('/auth/register')
        .send({ name: 'Jony', email: '  Owner@Jony.UZ ', password: PASSWORD })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toMatchObject({ name: 'Jony', email: 'owner@jony.uz' });
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(res.body.data.tokens).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: expect.any(Number),
      });

      const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'owner@jony.uz' } });
      expect(stored.passwordHash).not.toContain(PASSWORD);
      expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);

      const token = await ctx.prisma.refreshToken.findFirstOrThrow({
        where: { userId: stored.id },
      });
      expect(token.tokenHash).not.toBe(res.body.data.tokens.refreshToken);
      expect(token.tokenHash).toHaveLength(64);
    });

    it('supports phone-only registration', async () => {
      const res = await ctx
        .http()
        .post('/auth/register')
        .send({ name: 'Phone', phone: '+998 90 123-45-67', password: PASSWORD })
        .expect(201);
      expect(res.body.data.user.phone).toBe('+998901234567');
    });

    it('rejects a duplicate email with 409', async () => {
      const user = await registerUser(ctx);
      const res = await ctx
        .http()
        .post('/auth/register')
        .send({ name: 'Again', email: user.email.toUpperCase(), password: PASSWORD })
        .expect(409);
      expect(res.body).toEqual({
        success: false,
        code: 'USER_ALREADY_EXISTS',
        message: expect.any(String),
      });
    });

    it('requires email or phone, and rejects unknown fields', async () => {
      const res = await ctx
        .http()
        .post('/auth/register')
        .send({ name: 'Nobody', password: PASSWORD, isAdmin: true })
        .expect(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      const fields = (res.body.details as { field: string }[]).map((d) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['email', 'isAdmin']));
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with email', async () => {
      const user = await registerUser(ctx);
      const res = await ctx
        .http()
        .post('/auth/login')
        .send({ login: user.email, password: PASSWORD })
        .expect(200);
      expect(res.body.data.user.id).toBe(user.id);
      expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
      const user = await registerUser(ctx);
      const res = await ctx
        .http()
        .post('/auth/login')
        .send({ login: user.email, password: 'wrong-password' })
        .expect(401);
      expect(res.body).toMatchObject({ success: false, code: 'INVALID_CREDENTIALS' });
    });

    it('gives the same answer for unknown users (no enumeration)', async () => {
      const res = await ctx
        .http()
        .post('/auth/login')
        .send({ login: 'ghost@test.uz', password: PASSWORD })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates tokens: the new pair works and the old refresh token is single-use', async () => {
      const user = await registerUser(ctx);

      const first = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);
      const rotated = first.body.data.refreshToken as string;
      expect(rotated).not.toBe(user.refreshToken);
      await ctx
        .http()
        .get('/auth/me')
        .auth(first.body.data.accessToken, { type: 'bearer' })
        .expect(200);

      // Replaying the old token = theft signal → 401 and the whole family is revoked.
      const replay = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');
      await ctx.http().post('/auth/refresh').send({ refreshToken: rotated }).expect(401);
    });

    it('rejects an access token used as a refresh token', async () => {
      const user = await registerUser(ctx);
      const res = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.accessToken })
        .expect(401);
      expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session so the refresh token no longer works', async () => {
      const user = await registerUser(ctx);
      await ctx.http().post('/auth/logout').send({ refreshToken: user.refreshToken }).expect(200);
      const res = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /auth/me', () => {
    it('requires a valid access token', async () => {
      await ctx.http().get('/auth/me').expect(401);
      const res = await ctx
        .http()
        .get('/auth/me')
        .auth('not-a-jwt', { type: 'bearer' })
        .expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns the profile with the organizations the user belongs to', async () => {
      const user = await registerUser(ctx);
      const org = await createOrganization(ctx, user);
      const res = await ctx
        .http()
        .get('/auth/me')
        .auth(user.accessToken, { type: 'bearer' })
        .expect(200);
      expect(res.body.data).toMatchObject({
        id: user.id,
        organizations: [{ id: org.id, role: { key: 'DIRECTOR' } }],
      });
    });
  });
});

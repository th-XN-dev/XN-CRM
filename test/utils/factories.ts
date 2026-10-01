import { randomUUID } from 'node:crypto';
import { type TestContext } from './test-app';

export const PASSWORD = 'correct-horse-battery';

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(ctx: TestContext, name = 'Test User'): Promise<TestUser> {
  const email = `user-${randomUUID()}@test.uz`;
  const res = await ctx
    .http()
    .post('/auth/register')
    .send({ name, email, password: PASSWORD })
    .expect(201);
  return {
    id: res.body.data.user.id,
    email,
    accessToken: res.body.data.tokens.accessToken,
    refreshToken: res.body.data.tokens.refreshToken,
  };
}

export async function createOrganization(
  ctx: TestContext,
  user: TestUser,
  name = 'Jony Math Academy',
) {
  const res = await ctx
    .http()
    .post('/organizations')
    .auth(user.accessToken, { type: 'bearer' })
    .send({ name })
    .expect(201);
  return res.body.data as { id: string; slug: string; name: string };
}

export async function createBranch(
  ctx: TestContext,
  user: TestUser,
  organizationId: string,
  code = 'TRM',
) {
  const res = await ctx
    .http()
    .post(`/organizations/${organizationId}/branches`)
    .auth(user.accessToken, { type: 'bearer' })
    .send({ name: `Branch ${code}`, code })
    .expect(201);
  return res.body.data as { id: string; organizationId: string; code: string };
}

/** Adds `user` to an organization with a system role (there is no invite API in Phase 1). */
export async function addMember(
  ctx: TestContext,
  userId: string,
  organizationId: string,
  roleKey: string,
  branchIds: string[] = [],
): Promise<void> {
  const role = await ctx.prisma.role.findFirstOrThrow({
    where: { key: roleKey, organizationId: null },
  });
  const membership = await ctx.prisma.organizationMembership.create({
    data: { userId, organizationId, roleId: role.id },
  });
  await ctx.prisma.branchMembership.createMany({
    data: branchIds.map((branchId) => ({ membershipId: membership.id, branchId, organizationId })),
  });
}

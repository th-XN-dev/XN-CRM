/**
 * Development demo of the management hierarchy (never runs in production):
 *
 *   Owner
 *   └── Jony                      (director)
 *       ├── Jony Kids English
 *       │   ├── Kids — Branch 1   (manager)
 *       │   └── Kids — Branch 2   (manager)
 *       └── Jony Math Academy
 *           └── Math — Branch 1   (cashier)
 *
 * Idempotent (re-running only fills in what is missing). Every account gets
 * DEMO_PASSWORD, or a random password printed once at the end.
 *   npm run db:seed:demo
 */
import { randomBytes } from 'node:crypto';
import { MembershipStatus, PlatformRole, type Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedLeadDefaults } from '../leads/leads.defaults';

const prisma = new PrismaClient();
const DOMAIN = 'demo.xn.uz';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The demo seed never runs in production');
  }
  const password = process.env.DEMO_PASSWORD ?? randomBytes(9).toString('base64url');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = async (email: string, name: string, data: Partial<Prisma.UserCreateInput> = {}) =>
    (await prisma.user.findUnique({ where: { email } })) ??
    prisma.user.create({ data: { email, name, passwordHash, ...data } });
  const role = async (key: string) =>
    (await prisma.role.findFirstOrThrow({ where: { key, organizationId: null } })).id;

  const owner = await user(`owner@${DOMAIN}`, 'Platform Owner', {
    platformRole: PlatformRole.OWNER,
  });
  const center =
    (await prisma.organization.findUnique({ where: { slug: 'jony' } })) ??
    (await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: { name: 'Jony', slug: 'jony', primaryColor: '#38B266', ownerId: owner.id },
      });
      await seedLeadDefaults(tx, created.id);
      return created;
    }));

  const subCenter = (code: string, name: string, slug: string) =>
    prisma.subCenter.upsert({
      where: { organizationId_code: { organizationId: center.id, code } },
      create: { organizationId: center.id, code, name, slug },
      update: {},
    });
  const kids = await subCenter('KIDS', 'Jony Kids English', 'kids-english');
  const math = await subCenter('MATH', 'Jony Math Academy', 'math-academy');
  const branch = (code: string, name: string, subCenterId: string) =>
    prisma.branch.upsert({
      where: { organizationId_code: { organizationId: center.id, code } },
      create: { organizationId: center.id, code, name, subCenterId },
      update: { subCenterId },
    });
  const kids1 = await branch('KE1', 'Kids — Branch 1', kids.id);
  const kids2 = await branch('KE2', 'Kids — Branch 2', kids.id);
  const math1 = await branch('MA1', 'Math — Branch 1', math.id);

  const member = async (userId: string, roleKey: string, branchIds: string[] | 'all') => {
    const existing = await prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId: center.id } },
    });
    if (existing) return;
    const membership = await prisma.organizationMembership.create({
      data: {
        userId,
        organizationId: center.id,
        roleId: await role(roleKey),
        status: MembershipStatus.ACTIVE,
        allBranches: branchIds === 'all',
      },
    });
    if (branchIds !== 'all') {
      await prisma.branchMembership.createMany({
        data: branchIds.map((branchId) => ({
          membershipId: membership.id,
          branchId,
          organizationId: center.id,
        })),
      });
    }
  };
  const director = await user(`director@jony.${DOMAIN}`, 'Jony Director');
  await member(director.id, 'DIRECTOR', 'all');
  const manager = await user(`manager@jony.${DOMAIN}`, 'Kids Manager');
  await member(manager.id, 'MANAGER', [kids1.id, kids2.id]);
  const cashier = await user(`cashier@jony.${DOMAIN}`, 'Math Cashier');
  await member(cashier.id, 'CASHIER', [math1.id]);

  console.log('Demo hierarchy ready. Accounts (new ones use this password):');
  for (const account of [owner, director, manager, cashier]) console.log(`  ${account.email}`);
  console.log(process.env.DEMO_PASSWORD ? '  password: $DEMO_PASSWORD' : `  password: ${password}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

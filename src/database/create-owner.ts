/**
 * Creates the platform OWNER, or promotes an existing account to it.
 * Production-safe: there is no default password — it must be passed in
 * the environment, and the account must change it at first sign-in.
 *
 *   PLATFORM_OWNER_EMAIL=founder@xn.uz PLATFORM_OWNER_NAME="Founder" \
 *   PLATFORM_OWNER_PASSWORD='…' npm run platform:owner
 *   (prod: node dist/database/create-owner.js)
 *
 * PLATFORM_OWNER_PASSWORD is required only when the account doesn't exist yet;
 * an existing account keeps its password and is only promoted.
 */
import { PlatformRole, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { normalizeEmail, normalizePhone } from '../common/utils/normalize';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.PLATFORM_OWNER_EMAIL?.trim();
  const phone = process.env.PLATFORM_OWNER_PHONE?.trim();
  const name = process.env.PLATFORM_OWNER_NAME?.trim() || 'Platform owner';
  const password = process.env.PLATFORM_OWNER_PASSWORD;
  if (!email && !phone) throw new Error('Set PLATFORM_OWNER_EMAIL or PLATFORM_OWNER_PHONE');

  const login = email ? { email: normalizeEmail(email) } : { phone: normalizePhone(phone!) };
  const existing = await prisma.user.findFirst({ where: { ...login, deletedAt: null } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { platformRole: PlatformRole.OWNER },
    });
    console.log(`Promoted ${email ?? phone} to platform OWNER (password unchanged).`);
    return;
  }
  if (!password || password.length < 12) {
    throw new Error('PLATFORM_OWNER_PASSWORD (12+ characters) is required to create the owner');
  }
  await prisma.user.create({
    data: {
      ...login,
      name,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      platformRole: PlatformRole.OWNER,
      mustChangePassword: true,
    },
  });
  console.log(
    `Created platform OWNER ${email ?? phone}; the password must be changed at first sign-in.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

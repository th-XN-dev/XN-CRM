/**
 * Idempotent seed: syncs the permission catalog and system roles.
 * Dev: `npm run db:seed` (tsx). Prod: `node dist/database/seed.js` (see Dockerfile).
 * Safe to run on every deploy. Never creates tenants or users.
 */
import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSION_KEYS, PERMISSION_DESCRIPTIONS } from '../permissions/permissions.catalog';
import { SYSTEM_ROLE_DEFINITIONS, type SystemRoleKey } from '../roles/roles.catalog';

const prisma = new PrismaClient();

async function seedPermissions(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const key of ALL_PERMISSION_KEYS) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { description: PERMISSION_DESCRIPTIONS[key] },
      create: { key, module: key.split('.')[0], description: PERMISSION_DESCRIPTIONS[key] },
    });
    ids.set(key, permission.id);
  }
  return ids;
}

async function seedSystemRoles(permissionIds: Map<string, string>): Promise<void> {
  for (const [key, definition] of Object.entries(SYSTEM_ROLE_DEFINITIONS) as [
    SystemRoleKey,
    (typeof SYSTEM_ROLE_DEFINITIONS)[SystemRoleKey],
  ][]) {
    // Composite unique with a NULL column can't be used in `upsert`, so find first.
    const existing = await prisma.role.findFirst({ where: { key, organizationId: null } });
    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: definition.name, description: definition.description, isSystem: true },
        })
      : await prisma.role.create({
          data: { key, name: definition.name, description: definition.description, isSystem: true },
        });

    // Only adds missing defaults; never strips permissions granted later via the DB.
    await prisma.rolePermission.createMany({
      data: definition.permissions.map((permissionKey) => ({
        roleId: role.id,
        permissionId: permissionIds.get(permissionKey)!,
      })),
      skipDuplicates: true,
    });

    if (definition.revoked?.length) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permission: { key: { in: [...definition.revoked] } } },
      });
    }
  }
}

async function main(): Promise<void> {
  const permissionIds = await seedPermissions();
  await seedSystemRoles(permissionIds);
  console.log(
    `Seeded ${permissionIds.size} permissions and ${Object.keys(SYSTEM_ROLE_DEFINITIONS).length} system roles.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

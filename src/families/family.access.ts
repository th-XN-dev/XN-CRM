import { type Prisma } from '@prisma/client';
import { restrictedBranchIds } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';

/**
 * A branch-restricted member sees a family when its primary branch is one of
 * theirs, or when any of its students currently belongs to one of their branches.
 */
export function familyAccessWhere(tenant: TenantContext): Prisma.FamilyWhereInput {
  const restricted = restrictedBranchIds(tenant);
  return {
    organizationId: tenant.organizationId,
    ...(restricted && {
      OR: [
        { primaryBranchId: { in: restricted } },
        { students: { some: { branchId: { in: restricted } } } },
      ],
    }),
  };
}

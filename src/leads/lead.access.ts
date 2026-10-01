import { type Prisma } from '@prisma/client';
import { branchOwnedWhere } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';

/**
 * Leads are owned by their branch. Branch-restricted members only see leads of
 * their branches. Soft-deleted leads are always excluded.
 */
export function leadAccessWhere(tenant: TenantContext): Prisma.LeadWhereInput {
  return { ...branchOwnedWhere(tenant), deletedAt: null };
}

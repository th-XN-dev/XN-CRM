import { type Prisma, StudentStatus } from '@prisma/client';
import { branchOwnedWhere } from '../tenancy/branch-scope';
import { type TenantContext } from '../tenancy/tenant-context';

/** Students are owned by their current home branch. */
export function studentAccessWhere(tenant: TenantContext): Prisma.StudentWhereInput {
  return branchOwnedWhere(tenant);
}

/** Statuses that still "belong" to the center (block family deactivation etc.). */
export const CURRENT_STUDENT_STATUSES: StudentStatus[] = [
  StudentStatus.ACTIVE,
  StudentStatus.FROZEN,
];

export const STUDENT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  middleName: true,
  status: true,
  branchId: true,
  birthDate: true,
} satisfies Prisma.StudentSelect;

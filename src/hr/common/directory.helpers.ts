import { EmployeeStatus } from '@prisma/client';
import { type AppException } from '../../common/errors/app.exception';
import { icontains, searchWhere } from '../../common/pagination/search';
import { isUniqueViolation } from '../../common/utils/prisma-errors';
import { type TenantContext } from '../../tenancy/tenant-context';
import { DIRECTORY_SELECT, type ListDirectoryQueryDto } from './directory.dto';

/** `select` for a directory row plus its count of current (non-terminated) employees. */
export const DIRECTORY_WITH_COUNT_SELECT = {
  ...DIRECTORY_SELECT,
  _count: {
    select: { employees: { where: { status: { not: EmployeeStatus.TERMINATED } } } },
  },
} as const;

/** Flattens Prisma's `_count` into `employeeCount`. */
export function presentDirectoryItem<T extends { _count: { employees: number } }>(
  record: T,
): Omit<T, '_count'> & { employeeCount: number } {
  const { _count, ...rest } = record;
  return { ...rest, employeeCount: _count.employees };
}

/** Organization + active flag + free-text search on name/code. */
export function directoryWhere(tenant: TenantContext, query: ListDirectoryQueryDto) {
  return {
    organizationId: tenant.organizationId,
    isActive: query.isActive,
    ...searchWhere(query.search, (term) => [{ name: icontains(term) }, { code: icontains(term) }]),
  };
}

/** Runs a write and maps the `(organizationId, code)` unique violation to a 409. */
export async function guardCode<T>(write: () => Promise<T>, codeTaken: () => AppException) {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw codeTaken();
    throw error;
  }
}

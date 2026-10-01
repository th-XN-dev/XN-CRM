import { AppException } from '../common/errors/app.exception';
import { branchListFilter, branchOwnedWhere } from './branch-scope';
import { type TenantContext } from './tenant-context';

const tenant = (overrides: Partial<TenantContext>): TenantContext => ({
  userId: 'u',
  organizationId: 'org',
  timezone: 'Asia/Tashkent',
  membershipId: 'm',
  role: { id: 'r', key: 'MANAGER' },
  permissions: new Set(),
  allBranches: false,
  branchIds: ['b1', 'b2'],
  branchId: null,
  ...overrides,
});

describe('branch scope', () => {
  it('restricts branch-owned records to the member branches', () => {
    expect(branchOwnedWhere(tenant({}))).toEqual({
      organizationId: 'org',
      branchId: { in: ['b1', 'b2'] },
    });
    expect(branchOwnedWhere(tenant({ allBranches: true }))).toEqual({ organizationId: 'org' });
  });

  it('list filter: explicit branch > selected branch > all accessible', () => {
    expect(branchListFilter(tenant({ branchId: 'b2' }), 'b1')).toBe('b1');
    expect(branchListFilter(tenant({ branchId: 'b2' }))).toBe('b2');
    expect(branchListFilter(tenant({}))).toEqual({ in: ['b1', 'b2'] });
    expect(branchListFilter(tenant({ allBranches: true }))).toBeUndefined();
  });

  it('rejects an explicit branch outside the member branches', () => {
    expect(() => branchListFilter(tenant({}), 'b3')).toThrow(AppException);
  });
});

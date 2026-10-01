import { StudentStatus } from '@prisma/client';
import { canTransition, ENROLLMENT_CLOSURE } from './student-status';

describe('student status rules', () => {
  it.each([
    ['ACTIVE', 'FROZEN', true],
    ['FROZEN', 'ACTIVE', true],
    ['ACTIVE', 'LEFT', true],
    ['LEFT', 'ACTIVE', true],
    ['GRADUATED', 'FROZEN', false],
    ['LEFT', 'GRADUATED', false],
  ] as const)('%s → %s allowed: %s', (from, to, allowed) => {
    expect(canTransition(StudentStatus[from], StudentStatus[to])).toBe(allowed);
  });

  it('closes the active enrollment only for terminal statuses', () => {
    expect(ENROLLMENT_CLOSURE.GRADUATED).toBe('COMPLETED');
    expect(ENROLLMENT_CLOSURE.LEFT).toBe('CANCELLED');
    expect(ENROLLMENT_CLOSURE.FROZEN).toBeUndefined();
  });
});

import { EnrollmentStatus, StudentStatus } from '@prisma/client';

/** Allowed lifecycle moves. Returning students (LEFT/GRADUATED → ACTIVE) are allowed. */
const TRANSITIONS: Record<StudentStatus, readonly StudentStatus[]> = {
  ACTIVE: [StudentStatus.FROZEN, StudentStatus.GRADUATED, StudentStatus.LEFT],
  FROZEN: [StudentStatus.ACTIVE, StudentStatus.GRADUATED, StudentStatus.LEFT],
  GRADUATED: [StudentStatus.ACTIVE],
  LEFT: [StudentStatus.ACTIVE],
};

export function canTransition(from: StudentStatus, to: StudentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** How an ACTIVE enrollment is closed when the student reaches a terminal status. */
export const ENROLLMENT_CLOSURE: Partial<Record<StudentStatus, EnrollmentStatus>> = {
  GRADUATED: EnrollmentStatus.COMPLETED,
  LEFT: EnrollmentStatus.CANCELLED,
};

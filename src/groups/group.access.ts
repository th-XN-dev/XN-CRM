import { EnrollmentStatus, type Prisma } from '@prisma/client';

export const GROUP_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  courseId: true,
  levelId: true,
  name: true,
  capacity: true,
  monthlyPrice: true,
  status: true,
  startDate: true,
  endDate: true,
  teacherId: true,
  roomId: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true, code: true } },
  course: { select: { id: true, name: true, code: true } },
  level: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  room: { select: { id: true, name: true, code: true } },
  _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
} satisfies Prisma.GroupSelect;

type GroupRow = Prisma.GroupGetPayload<{ select: typeof GROUP_SELECT }>;

export function toGroupResponse({ _count, ...group }: GroupRow) {
  return { ...group, enrolledCount: _count.enrollments };
}

/** Counts ACTIVE enrollments; call after locking the group row to get a stable answer. */
export function countActiveEnrollments(
  tx: Prisma.TransactionClient,
  groupId: string,
): Promise<number> {
  return tx.enrollment.count({ where: { groupId, status: EnrollmentStatus.ACTIVE } });
}

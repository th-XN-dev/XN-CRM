import { type DayOfWeek, type Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { formatTime } from '../common/utils/times';
import { RUNNING_GROUP_STATUSES } from '../courses/courses.service';

export interface Slot {
  dayOfWeek: DayOfWeek;
  startTime: Date;
  endTime: Date;
}

export interface SlotOwner {
  id: string;
  teacherId: string | null;
  startDate: Date;
  endDate: Date | null;
}

export interface ConflictCheck {
  slot: Slot;
  group: SlotOwner;
  roomId: string | null;
  /** The schedule being edited (never conflicts with itself). */
  excludeScheduleId?: string;
  /** Which rules to run (all by default). */
  checks?: { group?: boolean; room?: boolean; teacher?: boolean };
}

/**
 * Enforces "no double booking" for a weekly slot. Two slots clash when they are
 * on the same weekday, their times overlap (touching ends are fine: 18:30–20:00
 * and 20:00–21:30 don't clash), both are active, and the groups' date periods
 * overlap while both groups are running (ACTIVE/PAUSED).
 *
 * Call inside a transaction after locking the group, room and teacher rows.
 */
export async function assertNoScheduleConflicts(
  tx: Prisma.TransactionClient,
  { slot, group, roomId, excludeScheduleId, checks = {} }: ConflictCheck,
): Promise<void> {
  const overlapping: Prisma.ScheduleWhereInput = {
    dayOfWeek: slot.dayOfWeek,
    isActive: true,
    startTime: { lt: slot.endTime },
    endTime: { gt: slot.startTime },
    ...(excludeScheduleId && { id: { not: excludeScheduleId } }),
  };
  const concurrentGroup: Prisma.GroupWhereInput = {
    status: { in: RUNNING_GROUP_STATUSES },
    ...(group.endDate && { startDate: { lte: group.endDate } }),
    OR: [{ endDate: null }, { endDate: { gte: group.startDate } }],
  };
  const otherGroups = { id: { not: group.id }, ...concurrentGroup };

  if (checks.group !== false) {
    const clash = await findClash(tx, { ...overlapping, groupId: group.id });
    if (clash)
      throw conflict(ErrorCode.GROUP_SCHEDULE_CONFLICT, 'The group already has a lesson', clash);
  }
  if (roomId && checks.room !== false) {
    const clash = await findClash(tx, { ...overlapping, roomId, group: otherGroups });
    if (clash)
      throw conflict(ErrorCode.ROOM_SCHEDULE_CONFLICT, 'The room is already booked', clash);
  }
  if (group.teacherId && checks.teacher !== false) {
    const clash = await findClash(tx, {
      ...overlapping,
      group: { ...otherGroups, teacherId: group.teacherId },
    });
    if (clash)
      throw conflict(ErrorCode.TEACHER_SCHEDULE_CONFLICT, 'The teacher already teaches', clash);
  }
}

type Clash = { dayOfWeek: DayOfWeek; startTime: Date; endTime: Date; group: { name: string } };

function findClash(
  tx: Prisma.TransactionClient,
  where: Prisma.ScheduleWhereInput,
): Promise<Clash | null> {
  return tx.schedule.findFirst({
    where,
    select: { dayOfWeek: true, startTime: true, endTime: true, group: { select: { name: true } } },
  });
}

function conflict(code: ErrorCode, prefix: string, clash: Clash): AppException {
  return AppException.conflict(
    code,
    `${prefix} at this time: "${clash.group.name}" ${clash.dayOfWeek} ${formatTime(clash.startTime)}–${formatTime(clash.endTime)}`,
  );
}

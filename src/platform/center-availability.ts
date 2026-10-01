import { CenterStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { todayIn } from '../common/utils/dates';

/** Whether a center can be used right now, and if not, why. */
export type CenterAvailability = 'ACTIVE' | 'FROZEN' | 'ARCHIVED' | 'EXPIRED' | 'NOT_STARTED';

export interface CenterLifecycle {
  status: CenterStatus;
  activeFrom: Date | null;
  activeUntil: Date | null;
  timezone: string;
}

/**
 * The single rule for "may members use this center": status first, then the
 * activation period, whose days are those of the center's own timezone
 * (`activeUntil` is the last usable day, inclusive).
 */
export function centerAvailability(
  center: CenterLifecycle,
  now: Date = new Date(),
): CenterAvailability {
  if (center.status === CenterStatus.ARCHIVED) return 'ARCHIVED';
  if (center.status === CenterStatus.FROZEN) return 'FROZEN';
  const today = todayIn(center.timezone, now);
  if (center.activeFrom && today < center.activeFrom) return 'NOT_STARTED';
  if (center.activeUntil && today > center.activeUntil) return 'EXPIRED';
  return 'ACTIVE';
}

/** The 403 a member gets for an unavailable center. */
export function centerUnavailable(
  availability: Exclude<CenterAvailability, 'ACTIVE'>,
): AppException {
  switch (availability) {
    case 'FROZEN':
      return AppException.forbidden(
        ErrorCode.CENTER_FROZEN,
        'This center is temporarily frozen. Contact the administrator.',
      );
    case 'EXPIRED':
      return AppException.forbidden(
        ErrorCode.CENTER_EXPIRED,
        "This center's activation period has ended. Contact the administrator.",
      );
    case 'NOT_STARTED':
      return AppException.forbidden(
        ErrorCode.CENTER_NOT_STARTED,
        "This center's activation period has not started yet.",
      );
    case 'ARCHIVED':
      return AppException.forbidden(ErrorCode.CENTER_ARCHIVED, 'This center has been archived.');
  }
}

/** Centers their members still see (frozen/expired ones are listed with the reason). */
export const LISTED_CENTER_WHERE = {
  deletedAt: null,
  status: { not: CenterStatus.ARCHIVED },
} as const;

export const CENTER_LIFECYCLE_SELECT = {
  status: true,
  activeFrom: true,
  activeUntil: true,
  timezone: true,
} as const;

/** A branch can be worked in only while its sub-center (if any) is active. */
export const USABLE_BRANCH_WHERE = {
  isActive: true,
  deletedAt: null,
  OR: [{ subCenterId: null }, { subCenter: { status: CenterStatus.ACTIVE } }],
};

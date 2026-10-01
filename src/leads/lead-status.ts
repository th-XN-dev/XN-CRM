import { LeadActivityType, LeadStatus } from '@prisma/client';

/**
 * Statuses that make a lead "live" for duplicate detection: a new lead with the
 * same normalized phone is rejected while another lead is in any of these
 * states. CONVERTED and LOST leads free the phone up again.
 */
export const OPEN_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
  LeadStatus.TRIAL_BOOKED,
  LeadStatus.TRIAL_ATTENDED,
  LeadStatus.NEGOTIATION,
];

export const TERMINAL_LEAD_STATUSES: LeadStatus[] = [LeadStatus.CONVERTED, LeadStatus.LOST];

export function isTerminal(status: LeadStatus): boolean {
  return TERMINAL_LEAD_STATUSES.includes(status);
}

/**
 * CONVERTED is never set through the status endpoint — only the conversion flow
 * produces it (it also creates the family/student/enrollment). Every other move
 * is allowed so the pipeline stays flexible, except that terminal states are
 * final (a LOST lead is reopened by creating a new lead).
 */
export function canChangeStatus(from: LeadStatus, to: LeadStatus): boolean {
  if (to === LeadStatus.CONVERTED) return false;
  if (from === to) return false;
  if (isTerminal(from)) return false;
  return true;
}

/** The activity note prefix recorded when a lead reaches each status. */
export const STATUS_ACTIVITY_TYPE = LeadActivityType.STATUS_CHANGED;

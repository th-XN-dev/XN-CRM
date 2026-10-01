export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Strips spaces, dashes and parentheses: "+998 (90) 123-45-67" → "+998901234567". */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '');
}

/**
 * Canonical digits-only key for duplicate detection. Drops every non-digit and
 * a leading Uzbek country code, then keeps the 9-digit national number, so
 * "+998901234567", "998901234567" and "90 123 45 67" all map to "901234567".
 */
export function normalizeLeadPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const national = digits.length > 9 && digits.startsWith('998') ? digits.slice(3) : digits;
  return national.slice(-9) || digits;
}

export const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

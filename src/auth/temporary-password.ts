import { randomInt } from 'node:crypto';

/** No look-alikes (0/O, 1/l/I), so it can be read out or typed from a screen. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * A one-time password for a new account (directors, staff). It is returned
 * once in the API response, stored only as a hash, and the account must
 * change it at first sign-in (`User.mustChangePassword`).
 */
export function generateTemporaryPassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

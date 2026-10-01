/** Same alphabet as the API (no look-alikes such as 0/O or 1/l/I). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A random temporary password typed into the form (the API generates one when it's left empty). */
export function generateTemporaryPassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

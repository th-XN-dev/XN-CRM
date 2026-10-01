/**
 * Makes arbitrary data safe to store in the audit trail: secrets are removed
 * by key name, and size is bounded (depth, array length, string length, total).
 */
const SENSITIVE_KEY =
  /(password|passwd|secret|token|authorization|cookie|api[-_]?key|hash|card[-_]?number)/i;
/** Short names matched exactly (as substrings they'd hit "mapping", "footprint"...). */
const SENSITIVE_EXACT = /^(otp|pin|cvv|code_?verifier)$/i;

const MAX_DEPTH = 5;
const MAX_ARRAY = 50;
const MAX_STRING = 1_000;
const MAX_JSON_BYTES = 16_000;

export type AuditJson =
  string | number | boolean | null | AuditJson[] | { [key: string]: AuditJson };

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || SENSITIVE_EXACT.test(key);
}

export function sanitizeForAudit(value: unknown): AuditJson | null {
  if (value === undefined) return null;
  const clean = walk(value, 0);
  const size = Buffer.byteLength(JSON.stringify(clean));
  return size > MAX_JSON_BYTES ? { truncated: true, bytes: size } : clean;
}

function walk(value: unknown, depth: number): AuditJson {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return null; // functions, symbols
  // Prisma.Decimal and similar value objects serialize through toJSON.
  if ('toJSON' in value && typeof value.toJSON === 'function') {
    return walk((value as { toJSON: () => unknown }).toJSON(), depth);
  }
  if (depth >= MAX_DEPTH) return '[depth limit]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => walk(item, depth + 1));
    return value.length > MAX_ARRAY ? [...items, `[+${value.length - MAX_ARRAY} more]`] : items;
  }
  const out: Record<string, AuditJson> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || isSensitiveKey(key)) continue;
    out[key] = walk(entry, depth + 1);
  }
  return out;
}

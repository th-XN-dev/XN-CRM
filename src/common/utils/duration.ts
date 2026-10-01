const UNIT_MS = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** Parses "15m", "30d", "500ms" … into milliseconds (format validated at boot). */
export function durationToMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

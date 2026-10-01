import { durationToMs } from './duration';

describe('durationToMs', () => {
  it('parses supported units', () => {
    expect(durationToMs('500ms')).toBe(500);
    expect(durationToMs('15m')).toBe(900_000);
    expect(durationToMs('30d')).toBe(2_592_000_000);
  });

  it('rejects invalid values', () => {
    expect(() => durationToMs('15 minutes')).toThrow();
  });
});

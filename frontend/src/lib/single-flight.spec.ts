import { describe, expect, it, vi } from 'vitest';
import { singleFlight } from './single-flight';

describe('singleFlight', () => {
  it('shares one call between concurrent callers, then allows a new one', async () => {
    let resolve!: (v: string) => void;
    const fn = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const shared = singleFlight(fn);
    const calls = [shared(), shared(), shared()];
    resolve('token');
    await expect(Promise.all(calls)).resolves.toEqual(['token', 'token', 'token']);
    expect(fn).toHaveBeenCalledTimes(1);
    const next = shared();
    resolve('again');
    await expect(next).resolves.toBe('again');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

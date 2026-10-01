/**
 * Wraps an async function so concurrent callers share one in-flight call
 * (e.g. five requests hit 401 at once → one token refresh).
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    inFlight ??= fn().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

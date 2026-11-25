export interface PollOptions {
  /** Hard upper bound for the whole poll. */
  timeoutMs?: number;
  /** Delay between attempts; grows with a capped exponential backoff. */
  intervalMs?: number;
  maxIntervalMs?: number;
  description?: string;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Bounded polling for eventually-consistent state. Never an unbounded sleep:
 * it resolves as soon as `predicate` holds and fails with the last observed
 * value once `timeoutMs` is exhausted.
 */
export async function pollUntil<T>(
  probe: () => Promise<T>,
  predicate: (value: T) => boolean,
  {
    timeoutMs = 10_000,
    intervalMs = 100,
    maxIntervalMs = 1_000,
    description = 'condition',
  }: PollOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let wait = intervalMs;
  let last: T | undefined;
  let attempts = 0;
  while (Date.now() <= deadline) {
    attempts += 1;
    try {
      last = await probe();
      if (predicate(last)) return last;
    } catch {
      // Treat transient failures as "not yet" and keep polling within the bound.
    }
    await delay(Math.min(wait, Math.max(0, deadline - Date.now())));
    wait = Math.min(wait * 2, maxIntervalMs);
  }
  throw new Error(
    `Timed out after ${timeoutMs} ms (${attempts} attempts) waiting for ${description}. Last value: ${JSON.stringify(last)}`,
  );
}

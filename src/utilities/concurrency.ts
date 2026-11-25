/**
 * Fires `count` operations as simultaneously as Node's event loop allows.
 * All request promises are created synchronously before any is awaited so
 * that they reach the server within the same scheduling window.
 */
export async function fireConcurrently<T>(
  count: number,
  operation: (index: number) => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  const operations = Array.from({ length: count }, (_, index) => operation(index));
  return Promise.allSettled(operations);
}

export function fulfilled<T>(results: PromiseSettledResult<T>[]): T[] {
  return results
    .filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled')
    .map((r) => r.value);
}

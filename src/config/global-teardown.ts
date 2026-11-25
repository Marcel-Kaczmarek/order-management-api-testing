import { sweepTestProducts } from '@src/utilities/cleanup';

/**
 * Safety net for test-data cleanup. Fixtures already soft-delete what each
 * test creates; this sweep catches anything left behind by interrupted runs.
 */
export default async function globalTeardown(): Promise<void> {
  await sweepTestProducts();
}

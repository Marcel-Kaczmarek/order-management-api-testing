/**
 * Removes generated artifacts and soft-deletes leftover QA test products.
 *   npm run cleanup            -> reports + leftover QA products
 *   npm run cleanup -- --reset -> additionally destroys the Docker volume (full DB reset)
 */
import { rmSync } from 'node:fs';
import path from 'node:path';
import { sweepTestProducts } from '../src/utilities/cleanup';
import { run } from './lib';

const root = path.resolve(__dirname, '..');
const GENERATED = [
  'reports',
  'allure-results',
  'allure-report',
  'test-results',
  'playwright-report',
];

async function main(): Promise<void> {
  for (const dir of GENERATED) {
    rmSync(path.join(root, dir), { recursive: true, force: true });
  }
  console.log(`Removed generated folders: ${GENERATED.join(', ')}`);

  if (process.argv.includes('--reset')) {
    process.exit(run('docker', ['compose', 'down', '-v'], { cwd: root }));
  }

  try {
    const removed = await sweepTestProducts();
    console.log(`Soft-deleted ${removed} leftover QA product(s).`);
  } catch (error) {
    console.warn(`Skipped API cleanup (environment not reachable): ${(error as Error).message}`);
  }
}

void main();

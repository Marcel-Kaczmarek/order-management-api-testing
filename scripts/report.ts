/**
 * Builds the Allure report from allure-results/ and prints a metrics summary
 * computed from the Playwright JSON report.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { run } from './lib';
import '../src/config/env';

const root = path.resolve(__dirname, '..');
const resultsDir = process.env.ALLURE_RESULTS_DIR ?? 'allure-results';
if (!existsSync(path.resolve(root, resultsDir))) {
  console.error('No allure-results/ found. Run a test command first (e.g. npm run test:smoke).');
  process.exit(1);
}
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const code = run(
  npx,
  [
    'allure',
    'generate',
    resultsDir,
    '--clean',
    '--output',
    'reports/allure-report',
    '--report-name',
    'OrderFlow-API-QA',
  ],
  { cwd: root },
);
if (code !== 0) process.exit(code);
console.log('Allure report: reports/allure-report/index.html');
console.log('Playwright report: npm run report:playwright');
process.exit(run(npx, ['tsx', 'scripts/summarize-results.ts'], { cwd: root }));

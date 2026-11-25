/**
 * Computes *actual* execution metrics from reports/json/results.json
 * (Playwright JSON reporter) and writes reports/summary.md.
 * Nothing here is hand-written: every number is derived from the run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface PwResult {
  status: string;
  duration: number;
  retry: number;
}
interface PwTest {
  expectedStatus: string;
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  results: PwResult[];
  annotations: { type: string; description?: string }[];
}
interface PwSpec {
  title: string;
  tags: string[];
  file: string;
  tests: PwTest[];
}
interface PwSuite {
  title: string;
  file: string;
  specs: PwSpec[];
  suites?: PwSuite[];
}
interface PwReport {
  suites: PwSuite[];
  stats: {
    startTime: string;
    duration: number;
    expected: number;
    unexpected: number;
    flaky: number;
    skipped: number;
  };
}

const root = path.resolve(__dirname, '..');
const input = path.join(root, 'reports', 'json', 'results.json');
if (!existsSync(input)) {
  console.error('reports/json/results.json not found – run the tests first.');
  process.exit(1);
}
const report = JSON.parse(readFileSync(input, 'utf8')) as PwReport;

const specs: (PwSpec & { area: string })[] = [];
const walk = (suite: PwSuite) => {
  for (const spec of suite.specs) specs.push({ ...spec, area: spec.file.split('/')[0] ?? 'root' });
  suite.suites?.forEach(walk);
};
report.suites.forEach(walk);

type Row = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  expectedFail: number;
};
const blank = (): Row => ({
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  flaky: 0,
  expectedFail: 0,
});
const byArea = new Map<string, Row>();
const byTag = new Map<string, Row>();
const totals = blank();
const defects = new Set<string>();

for (const spec of specs) {
  for (const test of spec.tests) {
    const rows = [
      totals,
      byArea.get(spec.area) ?? blank(),
      ...spec.tags.map((t) => byTag.get(t) ?? blank()),
    ];
    byArea.set(spec.area, rows[1]!);
    spec.tags.forEach((t, i) => byTag.set(t, rows[i + 2]!));
    const knownDefect = test.expectedStatus === 'failed';
    // A defect counts as evidenced only if its reproduction actually failed as expected in this run.
    if (knownDefect && test.status === 'expected') {
      test.annotations
        .filter((a) => a.type === 'defect')
        .forEach((a) => defects.add(a.description?.split(' ')[0] ?? ''));
    }
    for (const row of rows) {
      row.total += 1;
      if (test.status === 'skipped') row.skipped += 1;
      else if (test.status === 'flaky') row.flaky += 1;
      else if (test.status === 'unexpected') row.failed += 1;
      else if (knownDefect) row.expectedFail += 1;
      else row.passed += 1;
    }
  }
}

/** Pass rate over executed tests that are NOT known-defect reproductions. */
const pct = (r: Row) => {
  const executed = r.passed + r.failed + r.flaky;
  return executed === 0 ? 'n/a' : `${((r.passed / executed) * 100).toFixed(1)}%`;
};
const table = (title: string, map: Map<string, Row>) =>
  [
    `### ${title}`,
    '',
    '| Group | Total | Passed | Known-defect reproduced | Failed | Flaky | Skipped | Pass rate* |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...[...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([k, r]) =>
          `| ${k} | ${r.total} | ${r.passed} | ${r.expectedFail} | ${r.failed} | ${r.flaky} | ${r.skipped} | ${pct(r)} |`,
      ),
    '',
  ].join('\n');

const md = [
  '# Test Execution Summary (generated)',
  '',
  `- Run started: ${report.stats.startTime}`,
  `- Duration: ${(report.stats.duration / 1000).toFixed(1)} s`,
  `- Total tests: **${totals.total}** · Passed: **${totals.passed}** · Failed: **${totals.failed}** · Flaky: **${totals.flaky}** · Skipped: **${totals.skipped}**`,
  `- Known-defect reproductions that failed as expected: **${totals.expectedFail}** (they assert the *correct* behaviour and are marked \`test.fail()\`)`,
  `- Pass rate*: **${pct(totals)}** · Unexpected results (failed + flaky): **${totals.failed + totals.flaky}**`,
  `- Defects evidenced by this run: ${[...defects].filter(Boolean).sort().join(', ') || 'none'}`,
  '',
  '\\* Pass rate =passed ÷ (passed + failed + flaky), excluding known-defect reproductions and skipped tests. A known-defect test that unexpectedly *passes* is counted as Failed, so a fixed bug is noticed.',
  '',
  table('By test area (folder)', byArea),
  table('By tag', byTag),
].join('\n');

mkdirSync(path.join(root, 'reports'), { recursive: true });
writeFileSync(path.join(root, 'reports', 'summary.md'), md);
console.log(md);

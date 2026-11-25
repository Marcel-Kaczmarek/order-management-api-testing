/**
 * Runs a k6 scenario against the LOCAL environment.
 * Uses a locally installed `k6` binary when available, otherwise the official
 * grafana/k6 Docker image (no local install needed).
 *
 *   npm run test:performance                 # smoke
 *   npm run test:performance:load|stress|spike
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env';
import { bypassProxyForLocalhost, commandExists, run } from './lib';

bypassProxyForLocalhost();

const SCENARIOS = ['smoke', 'load', 'stress', 'spike'] as const;
type Scenario = (typeof SCENARIOS)[number];

const scenario = (process.argv[2] ?? 'smoke') as Scenario;
if (!SCENARIOS.includes(scenario)) {
  console.error(`Unknown scenario "${scenario}". Use one of: ${SCENARIOS.join(', ')}`);
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
mkdirSync(path.join(root, 'reports', 'performance'), { recursive: true });

const k6Env: Record<string, string> = {
  ADMIN_EMAIL: env.ADMIN_EMAIL,
  ADMIN_PASSWORD: env.ADMIN_PASSWORD,
  CUSTOMER_EMAIL: env.SEED_CUSTOMER_EMAIL,
  CUSTOMER_PASSWORD: env.SEED_CUSTOMER_PASSWORD,
  SUMMARY_DIR: 'reports/performance',
};

let code: number;
if (commandExists('k6')) {
  code = run('k6', ['run', `performance/${scenario}.js`], {
    cwd: root,
    env: { ...process.env, ...k6Env, BASE_URL: env.API_BASE_URL },
  });
} else {
  console.log('k6 not found locally – using the grafana/k6 Docker image.');
  // Inside the container "localhost" is the container itself.
  const baseUrl = env.API_BASE_URL.replace(/localhost|127\.0\.0\.1/, 'host.docker.internal');
  const envArgs = Object.entries({ ...k6Env, BASE_URL: baseUrl }).flatMap(([k, v]) => [
    '-e',
    `${k}=${v}`,
  ]);
  code = run(
    'docker',
    [
      'run',
      '--rm',
      '--add-host=host.docker.internal:host-gateway',
      '-v',
      `${root}:/work`,
      '-w',
      '/work',
      ...envArgs,
      'grafana/k6:1.8.3',
      'run',
      `performance/${scenario}.js`,
    ],
    { cwd: root },
  );
}
// k6 exits 99 when thresholds are crossed – propagate so CI fails the gate.
process.exit(code);

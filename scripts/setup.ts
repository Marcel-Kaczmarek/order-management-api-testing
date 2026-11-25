/**
 * One-command local setup:
 *   1. checks prerequisites, 2. creates .env from .env.example if missing,
 *   3. builds/starts Docker Compose and waits for health checks,
 *   4. verifies health, 5. seeds reference data.
 * Pass --skip-docker when the environment is already running (e.g. in CI).
 */
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { commandExists, exitWith, run } from './lib';

const root = path.resolve(__dirname, '..');
const skipDocker = process.argv.includes('--skip-docker');

if (!existsSync(path.join(root, '.env'))) {
  copyFileSync(path.join(root, '.env.example'), path.join(root, '.env'));
  console.log('Created .env from .env.example (local defaults).');
}

if (!skipDocker) {
  if (!commandExists('docker')) {
    console.error('Docker is required. Install Docker Desktop / Docker Engine with Compose v2.');
    exitWith(1);
  }
  const up = run('docker', ['compose', 'up', '-d', '--build', '--wait'], { cwd: root });
  if (up !== 0) {
    console.error(
      'docker compose failed. Try "npm run env:logs" and see README › Troubleshooting.',
    );
    exitWith(up);
  }
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const steps: [string, string[]][] = [
  [npx, ['tsx', 'scripts/health-check.ts']],
  [npx, ['tsx', 'scripts/seed.ts']],
];
for (const [cmd, args] of steps) {
  const code = run(cmd, args, { cwd: root });
  if (code !== 0) exitWith(code);
}
console.log('\nSetup complete. Next: npm run test:smoke');

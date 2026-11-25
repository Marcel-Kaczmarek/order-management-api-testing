/**
 * Verifies that the API, the seeded admin account and the read-only database
 * role are all usable. Exit code 0 = environment ready.
 */
import { request } from '@playwright/test';
import { apiRoot, env } from '../src/config/env';
import { DbClient } from '../src/database/DbClient';
import { pollUntil } from '../src/utilities/polling';

async function main(): Promise<void> {
  const timeoutMs = Number(process.env.HEALTH_TIMEOUT_MS ?? 90_000);
  const context = await request.newContext({ baseURL: apiRoot });
  let failures = 0;
  const check = async (name: string, fn: () => Promise<string>) => {
    try {
      console.log(`  ✔ ${name}: ${await fn()}`);
    } catch (error) {
      failures += 1;
      console.error(`  ✘ ${name}: ${(error as Error).message}`);
    }
  };

  console.log(`Health check against ${apiRoot}`);
  await check('API responds', async () => {
    const status = await pollUntil(
      async () => (await context.get('products?limit=1', { failOnStatusCode: false })).status(),
      (s) => s === 200,
      { timeoutMs, intervalMs: 500, description: 'GET /api/products' },
    );
    return `HTTP ${status}`;
  });
  await check('OpenAPI document', async () => {
    const res = await context.get('docs-json', { failOnStatusCode: false });
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    return `${Object.keys(doc.paths).length} paths`;
  });
  await check('Seeded admin login', async () => {
    const res = await context.post('auth/login', {
      data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
      failOnStatusCode: false,
    });
    if (res.status() !== 201) throw new Error(`HTTP ${res.status()}`);
    return 'OK';
  });
  await check('PostgreSQL read-only role', async () => {
    const db = new DbClient();
    try {
      const rows = await db.query<{ users: string; ro: string }>(
        `SELECT (SELECT COUNT(*) FROM "User")::text AS users, current_setting('transaction_read_only') AS ro`,
      );
      return `${rows[0]?.users} users, transaction_read_only=${rows[0]?.ro}`;
    } finally {
      await db.close();
    }
  });

  await context.dispose();
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed. See README › Troubleshooting.`);
    process.exit(1);
  }
  console.log('\nEnvironment is healthy.');
}

void main();

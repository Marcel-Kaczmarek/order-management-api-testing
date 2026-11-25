import { request } from '@playwright/test';
import { apiRoot, env } from './env';
import { pollUntil } from '@src/utilities/polling';
import { DbClient } from '@src/database/DbClient';

/**
 * Fails fast – with an actionable message – if the environment is not ready,
 * instead of letting hundreds of tests fail with connection errors.
 */
export default async function globalSetup(): Promise<void> {
  const context = await request.newContext({ baseURL: apiRoot });
  try {
    await pollUntil(
      async () => (await context.get('products?limit=1', { failOnStatusCode: false })).status(),
      (status) => status === 200,
      { timeoutMs: 60_000, intervalMs: 500, description: `AUT health at ${apiRoot}products` },
    ).catch((error: Error) => {
      throw new Error(
        `${error.message}\nStart the environment with: docker compose up -d --build --wait`,
      );
    });

    const login = await context.post('auth/login', {
      data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
      failOnStatusCode: false,
    });
    if (login.status() !== 201) {
      throw new Error(`Seeded admin cannot log in (HTTP ${login.status()}). Run "npm run setup".`);
    }
  } finally {
    await context.dispose();
  }

  const db = new DbClient();
  try {
    await db.query('SELECT 1');
  } catch (error) {
    throw new Error(
      `Cannot connect to PostgreSQL at ${env.DB_HOST}:${env.DB_PORT} as ${env.DB_READONLY_USER}: ${(error as Error).message}`,
      { cause: error },
    );
  } finally {
    await db.close();
  }
}

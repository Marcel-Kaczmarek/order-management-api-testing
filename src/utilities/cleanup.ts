import { request } from '@playwright/test';
import { apiRoot, env } from '@src/config/env';
import { TEST_DATA_PREFIX } from '@src/constants';
import type { AuthResponse, PaginatedResponse, Product } from '@src/models';
import { logger } from './logger';

/**
 * Soft-deletes every *active* product whose name starts with the QA prefix,
 * using only the public admin API. Users and orders cannot be deleted through
 * the AUT's API, so they are isolated by unique data instead; a full reset is
 * available via `npm run env:reset`.
 */
export async function sweepTestProducts(): Promise<number> {
  const context = await request.newContext({ baseURL: apiRoot });
  let removed = 0;
  try {
    const login = await context.post('auth/login', {
      data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
      failOnStatusCode: false,
    });
    if (!login.ok()) return 0;
    const { accessToken } = (await login.json()) as AuthResponse;
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Collect first, then delete: deleting while paginating would shift pages.
    const ids: string[] = [];
    for (let page = 1; page <= 1000; page += 1) {
      const res = await context.get('products', {
        params: { page, limit: 100 },
        failOnStatusCode: false,
      });
      if (!res.ok()) break;
      const body = (await res.json()) as PaginatedResponse<Product>;
      ids.push(...body.data.filter((p) => p.name.startsWith(TEST_DATA_PREFIX)).map((p) => p.id));
      if (page >= body.meta.totalPages) break;
    }
    for (const id of ids) {
      const res = await context.delete(`products/${id}`, { headers, failOnStatusCode: false });
      if (res.ok()) removed += 1;
    }
    if (removed > 0) logger.info('cleanup: soft-deleted leftover QA products', { removed });
  } finally {
    await context.dispose();
  }
  return removed;
}

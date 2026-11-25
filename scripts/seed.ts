/**
 * Idempotently provisions reference data used by Postman and k6 through the
 * public admin API (never via direct SQL writes).
 *
 * The AUT seeds its own admin, demo customer and 4 demo products on startup
 * (application-under-test/prisma/seed.ts). This script adds a dedicated
 * high-stock catalog so performance runs never exhaust the demo inventory.
 */
import { request } from '@playwright/test';
import { apiRoot, env } from '../src/config/env';
import type { AuthResponse, PaginatedResponse, Product } from '../src/models';

export const PERF_PRODUCTS = [
  { name: 'PERF-Catalog Item A', priceCents: 1999 },
  { name: 'PERF-Catalog Item B', priceCents: 4550 },
  { name: 'PERF-Catalog Item C', priceCents: 12000 },
];
const PERF_STOCK = 1_000_000;

async function main(): Promise<void> {
  const context = await request.newContext({ baseURL: apiRoot });
  const login = await context.post('auth/login', {
    data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    failOnStatusCode: false,
  });
  if (!login.ok()) throw new Error(`Admin login failed: HTTP ${login.status()}`);
  const { accessToken } = (await login.json()) as AuthResponse;
  const headers = { Authorization: `Bearer ${accessToken}` };

  const existing: Product[] = [];
  for (let page = 1; ; page += 1) {
    const res = await context.get('products', { params: { page, limit: 100 } });
    const body = (await res.json()) as PaginatedResponse<Product>;
    existing.push(...body.data);
    if (page >= body.meta.totalPages || body.meta.totalPages === 0) break;
  }

  for (const product of PERF_PRODUCTS) {
    const found = existing.find((p) => p.name === product.name);
    if (found) {
      if (found.stock < PERF_STOCK / 2) {
        await context.patch(`products/${found.id}`, { headers, data: { stock: PERF_STOCK } });
        console.log(`  ↻ restocked ${product.name}`);
      } else {
        console.log(`  ✔ ${product.name} present`);
      }
      continue;
    }
    const res = await context.post('products', {
      headers,
      data: {
        ...product,
        description: 'Reference data for performance and Postman runs',
        stock: PERF_STOCK,
      },
    });
    if (res.status() !== 201)
      throw new Error(`Cannot create ${product.name}: HTTP ${res.status()}`);
    console.log(`  + created ${product.name}`);
  }
  await context.dispose();
  console.log('Seed complete.');
}

if (require.main === module) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}

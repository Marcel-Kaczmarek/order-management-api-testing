/**
 * Standalone reproduction harness for the checkout concurrency defects
 * (BUG-002 oversell, BUG-012 timeout + phantom orders). Prints one line per round.
 *
 *   npm run repro:contention -- <buyers> <stock> <rounds>
 *   npm run repro:contention -- 12 3 5      # BUG-002: oversell limited stock
 *   npm run repro:contention -- 16 1000 6   # BUG-012: 5 s timeouts / phantom orders
 *
 * LOCAL ENVIRONMENT ONLY (enforced by src/config/env.ts).
 */
import { request } from '@playwright/test';
import { apiRoot, env } from '../src/config/env';
import { DbClient } from '../src/database/DbClient';
import { OrderRepository } from '../src/database/OrderRepository';
import type { AuthResponse, Product } from '../src/models';

async function main(): Promise<void> {
  const [buyers = 12, stock = 3, rounds = 5] = process.argv.slice(2).map(Number);
  const ctx = await request.newContext({ baseURL: apiRoot });
  const db = new DbClient();
  const repo = new OrderRepository(db);
  try {
    const admin = (await (
      await ctx.post('auth/login', {
        data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
      })
    ).json()) as AuthResponse;
    const adminAuth = { Authorization: `Bearer ${admin.accessToken}` };
    const tokens: string[] = [];
    for (let i = 0; i < buyers; i += 1) {
      const res = await ctx.post('auth/register', {
        data: {
          email: `repro.${Date.now().toString(36)}.${i}@example.test`,
          name: 'Repro Buyer',
          password: 'Repro!Pass123',
        },
      });
      tokens.push(((await res.json()) as AuthResponse).accessToken);
    }
    console.log(`buyers=${buyers} stock=${stock} rounds=${rounds} target=${apiRoot}`);

    for (let round = 1; round <= rounds; round += 1) {
      const product = (await (
        await ctx.post('products', {
          headers: adminAuth,
          data: { name: `QA-Repro ${Date.now()}`, priceCents: 100, stock },
        })
      ).json()) as Product;

      const results = await Promise.all(
        tokens.map(async (token) => {
          const started = performance.now();
          try {
            const res = await ctx.post('orders', {
              headers: { Authorization: `Bearer ${token}` },
              data: { items: [{ productId: product.id, quantity: 1 }] },
              failOnStatusCode: false,
              timeout: 60_000,
            });
            return { status: res.status(), ms: Math.round(performance.now() - started) };
          } catch {
            // Transport-level failure (e.g. connection reset); reported as status 0, never with headers.
            return { status: 0, ms: Math.round(performance.now() - started) };
          }
        }),
      );

      const finalStock = (await repo.findProduct(product.id))?.stock;
      const persisted = await repo.orderedUnits(product.id);
      const byStatus = new Map<number, number[]>();
      for (const r of results) byStatus.set(r.status, [...(byStatus.get(r.status) ?? []), r.ms]);
      const accepted = byStatus.get(201)?.length ?? 0;
      const summary = [...byStatus.entries()]
        .map(([status, ms]) => `${status}×${ms.length} (${Math.min(...ms)}–${Math.max(...ms)} ms)`)
        .join(', ');
      const flags = [
        finalStock !== undefined && finalStock < 0 ? 'NEGATIVE STOCK (BUG-002)' : '',
        persisted !== accepted ? `PHANTOM ORDERS: ${persisted - accepted} (BUG-012)` : '',
      ].filter(Boolean);
      console.log(
        `round ${round}: ${summary} | persisted=${persisted} stock ${stock}→${finalStock}${flags.length ? ` | ${flags.join(' | ')}` : ''}`,
      );
      await ctx.delete(`products/${product.id}`, { headers: adminAuth });
    }
  } finally {
    await db.close();
    await ctx.dispose();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});

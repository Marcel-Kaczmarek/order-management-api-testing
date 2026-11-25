import { test, expect, Tag, expectInventoryConserved } from '@src/fixtures';
import { fireConcurrently, fulfilled } from '@src/utilities/concurrency';

/**
 * Controlled concurrency scenarios. Each test owns its products, so the
 * contention is confined to the test and parallel workers stay independent.
 */
test.describe('Concurrency › inventory', { tag: [Tag.concurrency, Tag.database] }, () => {
  test('CON-01 concurrent orders within available stock: no lost updates', async ({
    api,
    registerCustomer,
    createProduct,
    repo,
  }) => {
    // Scope: atomicity of the stock decrement ("no lost updates"). On a slow or
    // loaded host some requests may time out with 500 (BUG-012, covered by
    // CON-11), so the assertions below are the invariants that must hold
    // regardless of how many requests succeed.
    const product = await createProduct({ stock: 100 });
    const buyers = await Promise.all(Array.from({ length: 5 }, () => registerCustomer()));

    const results = fulfilled(
      await fireConcurrently(buyers.length, (i) =>
        api.as(buyers[i]!).orders.create({ items: [{ productId: product.id, quantity: 3 }] }),
      ),
    );

    const acknowledged = results.filter((r) => r.status === 201);
    test.info().annotations.push({
      type: 'observed',
      description: `statuses=${results.map((r) => r.status).join(',')}`,
    });
    expect(
      acknowledged.length,
      'at least one order must succeed for the test to be meaningful',
    ).toBeGreaterThan(0);
    for (const order of acknowledged) {
      expect(
        await repo.findOrder(order.body.id),
        `acknowledged order ${order.body.id} is persisted`,
      ).toBeDefined();
    }
    const persistedUnits = await repo.orderedUnits(product.id);
    expect(
      (await repo.findProduct(product.id))?.stock,
      'stock decreased by exactly the persisted units',
    ).toBe(100 - persistedUnits);
    await expectInventoryConserved(repo, product, 100);
  });

  test('CON-02 concurrent admin stock updates: last write wins, value is never corrupted', async ({
    api,
    admin,
    createProduct,
    repo,
  }) => {
    const product = await createProduct({ stock: 1 });
    const targets = [10, 20, 30, 40, 50];

    const results = fulfilled(
      await fireConcurrently(targets.length, (i) =>
        api.as(admin).inventory.setStock(product.id, targets[i]!),
      ),
    );

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(targets).toContain((await repo.findProduct(product.id))?.stock);
  });

  test('CON-03 concurrent duplicate product creation creates independent records', async ({
    api,
    admin,
    data,
    repo,
  }) => {
    const payload = data.product();

    const results = fulfilled(
      await fireConcurrently(3, () => api.as(admin).products.create(payload)),
    );

    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(3);
    const rows = await repo.productsByName(payload.name);
    expect(rows).toHaveLength(3);
    for (const r of results) await api.as(admin).products.remove(r.body.id);
  });
});

import { test, expect, Tag, PG_INT4_MAX } from '@src/fixtures';

/**
 * Failure-path integration: atomicity of order creation and the effect of
 * cancellation on persisted data.
 */
test.describe(
  'Integration › cancellation & rollback',
  { tag: [Tag.integration, Tag.database, Tag.regression] },
  () => {
    test('INT-06 failed order creation leaves no partial data (validation failure)', async ({
      api,
      customer,
      createProduct,
      repo,
    }) => {
      const ok = await createProduct({ stock: 10 });
      const scarce = await createProduct({ stock: 0 });

      const result = await api.as(customer).orders.create({
        items: [
          { productId: ok.id, quantity: 1 },
          { productId: scarce.id, quantity: 1 },
        ],
      });

      expect(result).toHaveStatus(400);
      expect(await repo.ordersForUser(customer.user.id)).toEqual([]);
      expect(await repo.orderedUnits(ok.id)).toBe(0);
      expect((await repo.findProduct(ok.id))?.stock).toBe(10);
    });

    test('INT-07 database transaction rollback: an error after stock was decremented restores the stock', async ({
      api,
      customer,
      createProduct,
      repo,
    }) => {
      // totalCents is an INT4 column. 2 × (INT4_MAX - 1) overflows it, so the
      // failure happens inside the transaction *after* the stock decrement ran.
      // The status code of this failure is covered by BUG-004; here we verify atomicity.
      const product = await createProduct({ priceCents: PG_INT4_MAX - 1, stock: 10 });

      const result = await api
        .as(customer)
        .orders.create({ items: [{ productId: product.id, quantity: 2 }] });

      expect(result.status).toBeGreaterThanOrEqual(400);
      expect((await repo.findProduct(product.id))?.stock, 'stock must be rolled back').toBe(10);
      expect(await repo.ordersForUser(customer.user.id)).toEqual([]);
      expect(await repo.orderedUnits(product.id)).toBe(0);
    });

    test('INT-08 cancelled order keeps its items and totals (audit trail preserved)', async ({
      api,
      admin,
      customer,
      createProduct,
      placeOrder,
      repo,
    }) => {
      const product = await createProduct({ priceCents: 700, stock: 10 });
      const order = await placeOrder(customer, [{ productId: product.id, quantity: 3 }]);

      const cancelled = await api.as(admin).orders.cancel(order.id);

      expect(cancelled).toHaveStatus(200);
      const row = await repo.findOrder(order.id);
      expect(row).toMatchObject({ status: 'CANCELLED', totalCents: 2100 });
      expect(await repo.findOrderItems(order.id)).toHaveLength(1);
      expect(row!.updatedAt.getTime()).toBeGreaterThan(row!.createdAt.getTime());
    });
  },
);

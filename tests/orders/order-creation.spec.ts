import {
  test,
  expect,
  Tag,
  expectOrderTotalConsistent,
  expectUnitPricesSnapshot,
} from '@src/fixtures';
import { invalidOrderPayloads } from '@src/factories';

/**
 * Order creation business rules (OrdersService.create):
 * - all products must exist and be active
 * - each line's quantity must not exceed available stock
 * - unit price is captured from the catalog at checkout (never from the client)
 * - stock is decremented and the order created in one transaction
 */
test.describe('Orders › creation & pricing', { tag: [Tag.api, Tag.regression] }, () => {
  test('ORD-01 single-product order: total = unit price × quantity, status PENDING', async ({
    api,
    customer,
    createProduct,
  }) => {
    const product = await createProduct({ priceCents: 1299, stock: 10 });

    const result = await api
      .as(customer)
      .orders.create({ items: [{ productId: product.id, quantity: 3 }] });

    expect(result).toHaveStatus(201);
    expect(result.body).toMatchSchema('order');
    expect(result.body).toMatchObject({
      status: 'PENDING',
      userId: customer.user.id,
      totalCents: 3897,
    });
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0]).toMatchObject({
      productId: product.id,
      quantity: 3,
      unitPriceCents: 1299,
    });
  });

  test('ORD-02 multi-product order with different quantities sums every line', async ({
    api,
    customer,
    createProduct,
  }) => {
    const a = await createProduct({ priceCents: 1000, stock: 10 });
    const b = await createProduct({ priceCents: 2550, stock: 10 });
    const c = await createProduct({ priceCents: 1, stock: 10 });

    const result = await api.as(customer).orders.create({
      items: [
        { productId: a.id, quantity: 1 },
        { productId: b.id, quantity: 4 },
        { productId: c.id, quantity: 7 },
      ],
    });

    expect(result).toHaveStatus(201);
    expect(result.body.totalCents).toBe(1000 + 4 * 2550 + 7);
    expectOrderTotalConsistent(result.body);
    expectUnitPricesSnapshot(
      result.body,
      new Map([
        [a.id, 1000],
        [b.id, 2550],
        [c.id, 1],
      ]),
    );
  });

  test('ORD-03 stock is decremented by the ordered quantity', async ({
    api,
    customer,
    createProduct,
  }) => {
    const product = await createProduct({ stock: 10 });

    await api.as(customer).orders.create({ items: [{ productId: product.id, quantity: 4 }] });

    expect(await api.inventory.getStock(product.id)).toBe(6);
  });

  test('ORD-04 boundary: ordering exactly the remaining stock succeeds and leaves 0', async ({
    api,
    customer,
    createProduct,
  }) => {
    const product = await createProduct({ stock: 5 });

    const result = await api
      .as(customer)
      .orders.create({ items: [{ productId: product.id, quantity: 5 }] });

    expect(result).toHaveStatus(201);
    expect(await api.inventory.getStock(product.id)).toBe(0);
  });

  test(
    'ORD-05 boundary: one unit more than the stock is rejected and stock is untouched',
    { tag: Tag.negative },
    async ({ api, customer, createProduct, repo }) => {
      const product = await createProduct({ stock: 5 });

      const result = await api
        .as(customer)
        .orders.create({ items: [{ productId: product.id, quantity: 6 }] });

      expect(result).toBeApiError(
        400,
        new RegExp(`Insufficient stock for product ${escape(product.name)}`),
      );
      expect(await api.inventory.getStock(product.id)).toBe(5);
      expect(await repo.ordersForUser(customer.user.id)).toHaveLength(0);
    },
  );

  test(
    'ORD-06 out-of-stock product (stock 0) cannot be ordered',
    { tag: Tag.negative },
    async ({ api, customer, createProduct }) => {
      const product = await createProduct({ stock: 0 });

      const result = await api
        .as(customer)
        .orders.create({ items: [{ productId: product.id, quantity: 1 }] });

      expect(result).toBeApiError(400, /Insufficient stock/);
    },
  );

  test(
    'ORD-07 inactive (soft-deleted) product cannot be ordered',
    { tag: Tag.negative },
    async ({ api, admin, customer, createProduct, repo }) => {
      const product = await createProduct({ stock: 10 });
      await api.as(admin).products.remove(product.id);

      const result = await api
        .as(customer)
        .orders.create({ items: [{ productId: product.id, quantity: 1 }] });

      expect(result).toBeApiError(400, /One or more products are invalid/);
      expect((await repo.findProduct(product.id))?.stock).toBe(10);
    },
  );

  test(
    'ORD-08 non-existent product id is rejected',
    { tag: Tag.negative },
    async ({ api, customer }) => {
      const result = await api
        .as(customer)
        .orders.create({ items: [{ productId: 'cunknownunknownunknown0000', quantity: 1 }] });

      expect(result).toBeApiError(400, /One or more products are invalid/);
    },
  );

  test(
    'ORD-09 one invalid line rejects the whole order – valid lines keep their stock',
    { tag: Tag.negative },
    async ({ api, customer, createProduct, repo }) => {
      const valid = await createProduct({ stock: 10 });
      const scarce = await createProduct({ stock: 1 });

      const result = await api.as(customer).orders.create({
        items: [
          { productId: valid.id, quantity: 2 },
          { productId: scarce.id, quantity: 2 },
        ],
      });

      expect(result).toBeApiError(400, /Insufficient stock/);
      expect(await api.inventory.getStock(valid.id)).toBe(10);
      expect(await api.inventory.getStock(scarce.id)).toBe(1);
      expect(await repo.ordersForUser(customer.user.id)).toHaveLength(0);
    },
  );

  for (const { name, payload } of invalidOrderPayloads('cplaceholderplaceholder000')) {
    test(
      `ORD-10 payload validation: ${name} → 400`,
      { tag: Tag.negative },
      async ({ api, customer }) => {
        const result = await api.as(customer).orders.create(payload as Record<string, unknown>);

        expect(result).toBeApiError(400);
      },
    );
  }

  test(
    'ORD-11 client cannot dictate prices or totals (price tampering) → 400',
    { tag: [Tag.security, Tag.negative] },
    async ({ api, customer, createProduct }) => {
      const product = await createProduct({ priceCents: 5000, stock: 5 });

      const lineTamper = await api
        .as(customer)
        .orders.create({ items: [{ productId: product.id, quantity: 1, unitPriceCents: 1 }] });
      const totalTamper = await api
        .as(customer)
        .orders.create({ items: [{ productId: product.id, quantity: 1 }], totalCents: 1 });

      expect(lineTamper).toBeApiError(400, /unitPriceCents should not exist/);
      expect(totalTamper).toBeApiError(400, /property totalCents should not exist/);
      expect(await api.inventory.getStock(product.id)).toBe(5);
    },
  );

  test(
    'ORD-12 client cannot create an order on behalf of another user or in another state',
    { tag: [Tag.security, Tag.negative] },
    async ({ api, customer, otherCustomer, createProduct }) => {
      const product = await createProduct();

      const asOther = await api.as(customer).orders.create({
        items: [{ productId: product.id, quantity: 1 }],
        userId: otherCustomer.user.id,
      });
      const prePaid = await api
        .as(customer)
        .orders.create({ items: [{ productId: product.id, quantity: 1 }], status: 'PAID' });

      expect(asOther).toBeApiError(400, /property userId should not exist/);
      expect(prePaid).toBeApiError(400, /property status should not exist/);
    },
  );

  test('ORD-13 later catalog price changes do not alter existing orders (price snapshot)', async ({
    api,
    admin,
    customer,
    createProduct,
    placeOrder,
  }) => {
    const product = await createProduct({ priceCents: 2000, stock: 10 });
    const order = await placeOrder(customer, [{ productId: product.id, quantity: 2 }]);

    await api.as(admin).products.update(product.id, { priceCents: 9999 });
    const reread = await api.as(customer).orders.get(order.id);

    expect(reread.body.totalCents).toBe(4000);
    expect(reread.body.items[0]?.unitPriceCents).toBe(2000);
    expect(reread.body.items[0]?.product.priceCents).toBe(9999);
  });

  test('ORD-14 the same product on two lines within stock is accepted and totalled correctly', async ({
    api,
    customer,
    createProduct,
  }) => {
    const product = await createProduct({ priceCents: 300, stock: 10 });

    const result = await api.as(customer).orders.create({
      items: [
        { productId: product.id, quantity: 2 },
        { productId: product.id, quantity: 3 },
      ],
    });

    expect(result).toHaveStatus(201);
    expect(result.body.totalCents).toBe(1500);
    expect(await api.inventory.getStock(product.id)).toBe(5);
  });

  test('ORD-15 administrators can also place orders (no customer-only restriction)', async ({
    api,
    admin,
    createProduct,
  }) => {
    const product = await createProduct();

    const result = await api
      .as(admin)
      .orders.create({ items: [{ productId: product.id, quantity: 1 }] });

    expect(result).toHaveStatus(201);
    expect(result.body.userId).toBe(admin.user.id);
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

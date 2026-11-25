import { test, expect, Tag } from '@src/fixtures';

/**
 * Object-level authorization (OWASP API1:2023 – BOLA) and horizontal
 * privilege escalation between two unrelated customers.
 */
test.describe(
  'Authorization › object level (BOLA)',
  { tag: [Tag.authorization, Tag.security, Tag.regression, Tag.api] },
  () => {
    test('BOLA-01 customer can read their own order', async ({
      api,
      customer,
      createProduct,
      placeOrder,
    }) => {
      const product = await createProduct();
      const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

      const result = await api.as(customer).orders.get(order.id);

      expect(result).toHaveStatus(200);
      expect(result.body.userId).toBe(customer.user.id);
    });

    test('BOLA-02 customer cannot read another customer’s order → 403 without data leakage', async ({
      api,
      customer,
      otherCustomer,
      createProduct,
      placeOrder,
    }) => {
      const product = await createProduct();
      const victimOrder = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

      const result = await api.as(otherCustomer).orders.get(victimOrder.id);

      expect(result).toBeApiError(403, /Cannot access this order/);
      expect(result.rawText).not.toContain(customer.user.id);
      expect(result.body).not.toHaveProperty('items');
      expect(result.body).not.toHaveProperty('totalCents');
    });

    test('BOLA-03 order listing is scoped to the caller', async ({
      api,
      customer,
      otherCustomer,
      createProduct,
      placeOrder,
    }) => {
      const product = await createProduct();
      const mine = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);
      const theirs = await placeOrder(otherCustomer, [{ productId: product.id, quantity: 1 }]);

      const result = await api.as(customer).orders.list({ limit: 100 });

      expect(result).toHaveStatus(200);
      const ids = result.body.data.map((o) => o.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
      expect(result.body.data.every((o) => o.userId === customer.user.id)).toBe(true);
      expect(result.body.meta.total).toBe(1);
    });

    test('BOLA-04 admin can read any customer’s order', async ({
      api,
      admin,
      customer,
      createProduct,
      placeOrder,
    }) => {
      const product = await createProduct();
      const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

      const result = await api.as(admin).orders.get(order.id);

      expect(result).toHaveStatus(200);
      expect(result.body.userId).toBe(customer.user.id);
    });

    test('BOLA-05 another customer cannot cancel someone else’s order', async ({
      api,
      customer,
      otherCustomer,
      createProduct,
      placeOrder,
    }) => {
      const product = await createProduct();
      const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

      const result = await api.as(otherCustomer).orders.cancel(order.id);

      expect(result).toBeApiError(403);
      expect((await api.as(customer).orders.get(order.id)).body.status).toBe('PENDING');
    });

    test('BOLA-06 /users/me always resolves the token subject, never another user', async ({
      api,
      customer,
      otherCustomer,
    }) => {
      const mine = await api.as(customer).users.me();
      const theirs = await api.as(otherCustomer).users.me();

      expect(mine.body.id).toBe(customer.user.id);
      expect(theirs.body.id).toBe(otherCustomer.user.id);
      expect(mine.body.id).not.toBe(theirs.body.id);
    });

    test(
      'BOLA-07 order existence is distinguishable for foreign IDs (403) vs unknown IDs (404)',
      { tag: Tag.negative },
      async ({ api, customer, otherCustomer, createProduct, placeOrder }) => {
        // Documents observed behaviour: the AUT returns 404 for unknown IDs and 403 for
        // foreign ones, which lets a caller confirm that an order ID exists. Risk is low
        // because IDs are non-sequential CUIDs. See docs/risk-assessment.md (R-01).
        const product = await createProduct();
        const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

        const foreign = await api.as(otherCustomer).orders.get(order.id);
        const unknown = await api.as(otherCustomer).orders.get('cunknownunknownunknown0000');

        expect(foreign.status).toBe(403);
        expect(unknown.status).toBe(404);
      },
    );
  },
);

import { test, expect, Tag, Role } from '@src/fixtures';
import type { ApiClients } from '@src/clients';

/**
 * Function-level authorization (vertical privilege escalation).
 * Oracle: @Roles(Role.ADMIN) on products POST/PATCH/DELETE and GET /users,
 * explicit ADMIN check in OrdersService.updateStatus.
 */
test.describe(
  'Authorization › role-based access control',
  { tag: [Tag.authorization, Tag.security, Tag.regression, Tag.api] },
  () => {
    test('RBAC-01 admin can list all users', async ({ api, admin }) => {
      const result = await api.as(admin).users.list();

      expect(result).toHaveStatus(200);
      expect(result.body).toMatchSchema('userList');
      expect(result.body.some((u) => u.role === Role.ADMIN)).toBe(true);
    });

    test('RBAC-02 customer cannot list users → 403', async ({ api, customer }) => {
      const result = await api.as(customer).users.list();

      expect(result).toBeApiError(403, /Insufficient role/);
    });

    test(
      'RBAC-03 customer cannot create products → 403 and nothing is persisted',
      { tag: Tag.database },
      async ({ api, customer, data, db }) => {
        const payload = data.product();

        const result = await api.as(customer).products.create(payload);

        expect(result).toBeApiError(403);
        const rows = await db.query('SELECT id FROM "Product" WHERE name = $1', [payload.name]);
        expect(rows).toHaveLength(0);
      },
    );

    test('RBAC-04 customer cannot modify a product price → 403 and price unchanged', async ({
      api,
      customer,
      createProduct,
    }) => {
      const product = await createProduct({ priceCents: 1000 });

      const result = await api.as(customer).products.update(product.id, { priceCents: 1 });

      expect(result).toBeApiError(403);
      expect((await api.products.get(product.id)).body.priceCents).toBe(1000);
    });

    test('RBAC-05 customer cannot modify inventory → 403 and stock unchanged', async ({
      api,
      customer,
      createProduct,
    }) => {
      const product = await createProduct({ stock: 7 });

      const result = await api.as(customer).inventory.setStock(product.id, 1_000);

      expect(result).toBeApiError(403);
      expect(await api.inventory.getStock(product.id)).toBe(7);
    });

    test('RBAC-06 customer cannot delete a product → 403 and it stays active', async ({
      api,
      customer,
      createProduct,
    }) => {
      const product = await createProduct();

      const result = await api.as(customer).products.remove(product.id);

      expect(result).toBeApiError(403);
      expect((await api.products.get(product.id)).body.isActive).toBe(true);
    });

    test('RBAC-07 customer cannot change order status (e.g. mark own order PAID) → 403', async ({
      api,
      customer,
      createProduct,
      placeOrder,
    }) => {
      const product = await createProduct();
      const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

      const result = await api.as(customer).orders.confirmPayment(order.id);

      expect(result).toBeApiError(403);
      expect((await api.as(customer).orders.get(order.id)).body.status).toBe('PENDING');
    });

    const adminOnly: { name: string; call: (api: ApiClients) => Promise<{ status: number }> }[] = [
      { name: 'GET /users', call: (a) => a.users.list() },
      {
        name: 'POST /products',
        call: (a) => a.products.create({ name: 'QA-x', priceCents: 1, stock: 1 }),
      },
      {
        name: 'PATCH /products/:id',
        call: (a) => a.products.update('cunknownunknownunknown0000', { stock: 1 }),
      },
      {
        name: 'DELETE /products/:id',
        call: (a) => a.products.remove('cunknownunknownunknown0000'),
      },
      {
        name: 'PATCH /orders/:id/status',
        call: (a) => a.orders.updateStatus('cunknownunknownunknown0000', 'PAID'),
      },
      { name: 'GET /users/me', call: (a) => a.users.me() },
      { name: 'GET /orders', call: (a) => a.orders.list() },
      { name: 'POST /orders', call: (a) => a.orders.create({ items: [] }) },
    ];
    for (const { name, call } of adminOnly) {
      test(
        `RBAC-08 anonymous access to protected ${name} → 401`,
        { tag: Tag.negative },
        async ({ api }) => {
          const result = await call(api);

          expect(result.status).toBe(401);
        },
      );
    }

    test('RBAC-09 guards run before validation: customer gets 403 (not 400) on invalid admin payload', async ({
      api,
      customer,
    }) => {
      const result = await api.as(customer).products.create({ name: '' });

      expect(result).toBeApiError(403);
    });
  },
);

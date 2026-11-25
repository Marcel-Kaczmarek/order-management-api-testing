import {
  test,
  expect,
  Tag,
  expectInventoryConserved,
  expectOrderPersisted,
  expectOrderTotalConsistent,
} from '@src/fixtures';

/**
 * End-to-end backend workflow without a browser. Each step is verified both
 * through the API and directly in PostgreSQL.
 */
test.describe(
  'Integration › order fulfilment workflow',
  { tag: [Tag.integration, Tag.database, Tag.regression] },
  () => {
    test('INT-01 register → login → browse → order → pay → ship → deliver, with DB verification at every step', async ({
      api,
      admin,
      data,
      repo,
      createProduct,
    }) => {
      // Steps 1–3: an admin provisions catalog and inventory.
      const keyboard = await createProduct({ priceCents: 8999, stock: 15 });
      const cable = await createProduct({ priceCents: 1299, stock: 40 });

      // Steps 4–5: a customer registers and authenticates.
      const registration = data.customer();
      expect(await api.auth.register(registration)).toHaveStatus(201);
      const login = await api.auth.login({
        email: registration.email,
        password: registration.password,
      });
      expect(login).toHaveStatus(201);
      const customer = login.body;
      const dbUser = await repo.findUserByEmail(registration.email);
      expect(dbUser).toMatchObject({
        id: customer.user.id,
        role: 'CUSTOMER',
        name: registration.name,
      });

      // Step 6: product discovery and availability check.
      const detail = await api.products.get(keyboard.id);
      expect(detail.body).toMatchObject({ isActive: true, stock: 15 });

      // Steps 7–9: place the order; totals and persistence.
      const created = await api.as(customer.accessToken).orders.create({
        items: [
          { productId: keyboard.id, quantity: 2 },
          { productId: cable.id, quantity: 3 },
        ],
      });
      expect(created).toHaveStatus(201);
      const order = created.body;
      expect(order.totalCents).toBe(2 * 8999 + 3 * 1299);
      expectOrderTotalConsistent(order);
      await expectOrderPersisted(repo, order);

      // Step 10: inventory reserved (decremented) and conserved.
      expect((await repo.findProduct(keyboard.id))?.stock).toBe(13);
      expect((await repo.findProduct(cable.id))?.stock).toBe(37);
      await expectInventoryConserved(repo, keyboard, 15);
      await expectInventoryConserved(repo, cable, 40);

      // Steps 11–13: simulated payment, shipment, delivery.
      for (const status of ['PAID', 'SHIPPED', 'DELIVERED'] as const) {
        const transition = await api.as(admin).orders.updateStatus(order.id, status);
        expect(transition).toHaveStatus(200);
        expect((await repo.findOrder(order.id))?.status).toBe(status);
      }

      // Step 14: final consistency between API views and the database.
      const finalApi = await api.as(customer.accessToken).orders.get(order.id);
      await expectOrderPersisted(repo, finalApi.body);
      const history = await api.as(customer.accessToken).orders.list();
      expect(history.body.data.map((o) => o.id)).toEqual([order.id]);
      expect(history.body.data[0]?.status).toBe('DELIVERED');
      // Delivery does not move inventory.
      expect((await repo.findProduct(keyboard.id))?.stock).toBe(13);
    });

    test('INT-02 product ↔ inventory: admin restock is immediately visible to catalog and orders', async ({
      api,
      admin,
      customer,
      createProduct,
      repo,
    }) => {
      const product = await createProduct({ stock: 1 });
      expect(
        await api.as(customer).orders.create({ items: [{ productId: product.id, quantity: 3 }] }),
      ).toBeApiError(400, /Insufficient stock/);

      expect(await api.as(admin).inventory.setStock(product.id, 3)).toHaveStatus(200);

      expect((await repo.findProduct(product.id))?.stock).toBe(3);
      const retry = await api
        .as(customer)
        .orders.create({ items: [{ productId: product.id, quantity: 3 }] });
      expect(retry).toHaveStatus(201);
      expect(await api.inventory.getStock(product.id)).toBe(0);
    });

    test('INT-03 auth ↔ orders: the order owner is taken from the token subject', async ({
      api,
      customer,
      createProduct,
      repo,
    }) => {
      const product = await createProduct();

      const order = await api
        .as(customer)
        .orders.create({ items: [{ productId: product.id, quantity: 1 }] });

      const row = await repo.findOrder(order.body.id);
      const owner = await repo.findUserById(row?.userId ?? '');
      expect(owner?.email).toBe(customer.user.email);
    });

    test('INT-04 consistency across endpoints: detail, list and DB agree on the same order', async ({
      api,
      admin,
      customer,
      createProduct,
      placeOrder,
      repo,
    }) => {
      const product = await createProduct({ priceCents: 4321 });
      const order = await placeOrder(customer, [{ productId: product.id, quantity: 2 }]);

      const asCustomer = await api.as(customer).orders.get(order.id);
      const asAdmin = await api.as(admin).orders.get(order.id);
      const inList = (await api.as(customer).orders.list()).body.data.find(
        (o) => o.id === order.id,
      );

      expect(asCustomer.body).toEqual(asAdmin.body);
      expect(inList).toEqual(asCustomer.body);
      await expectOrderPersisted(repo, asCustomer.body);
    });

    test('INT-05 order history lists the customer’s orders newest first with correct pagination', async ({
      api,
      customer,
      createProduct,
      placeOrder,
    }) => {
      const product = await createProduct({ stock: 50 });
      const placed: string[] = [];
      for (let i = 0; i < 3; i += 1)
        placed.push((await placeOrder(customer, [{ productId: product.id, quantity: 1 }])).id);

      const page1 = await api.as(customer).orders.list({ page: 1, limit: 2 });
      const page2 = await api.as(customer).orders.list({ page: 2, limit: 2 });

      expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
      expect([...page1.body.data, ...page2.body.data].map((o) => o.id)).toEqual(
        [...placed].reverse(),
      );
      expect(page1.body).toMatchSchema('paginatedOrders');
    });
  },
);

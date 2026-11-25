import { test, expect, Tag, expectOrderPersisted } from '@src/fixtures';

/**
 * PostgreSQL-level validation (read-only role, parameterized SQL).
 * Verifies that API outcomes are persisted faithfully and that the schema
 * enforces the integrity rules the business depends on.
 */
test.describe('Database › persistence & integrity', { tag: [Tag.database, Tag.regression] }, () => {
  test('DB-01 registered user is stored with a bcrypt hash, never the plain password', async ({
    customer,
    repo,
  }) => {
    const row = await repo.findUserById(customer.user.id);

    expect(row).toMatchObject({
      email: customer.user.email,
      name: customer.user.name,
      role: 'CUSTOMER',
    });
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$10\$.{53}$/);
    expect(row?.passwordHash).not.toContain(customer.password);
  });

  test('DB-02 product API response equals the stored row', async ({ createProduct, repo }) => {
    const product = await createProduct();

    const row = await repo.findProduct(product.id);

    expect(row).toMatchObject({
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      stock: product.stock,
      isActive: true,
    });
    expect(row?.createdAt.toISOString()).toBe(product.createdAt);
    expect(row?.updatedAt.toISOString()).toBe(product.updatedAt);
  });

  test('DB-03 order, items, customer relationship and totals are persisted consistently', async ({
    customer,
    createProduct,
    placeOrder,
    repo,
  }) => {
    const a = await createProduct({ priceCents: 1111 });
    const b = await createProduct({ priceCents: 2222 });
    const order = await placeOrder(customer, [
      { productId: a.id, quantity: 1 },
      { productId: b.id, quantity: 2 },
    ]);

    await expectOrderPersisted(repo, order);
    expect(await repo.ordersWithInconsistentTotals([order.id])).toEqual([]);
    expect((await repo.findOrder(order.id))?.userId).toBe(customer.user.id);
  });

  test('DB-04 timestamps: createdAt ≤ updatedAt and updatedAt moves on status change', async ({
    api,
    admin,
    customer,
    createProduct,
    placeOrder,
    repo,
  }) => {
    const product = await createProduct();
    const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);
    const before = await repo.findOrder(order.id);

    await api.as(admin).orders.confirmPayment(order.id);

    const after = await repo.findOrder(order.id);
    expect(before!.createdAt.getTime()).toBeLessThanOrEqual(before!.updatedAt.getTime());
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
    expect(after!.createdAt.getTime()).toBe(before!.createdAt.getTime());
    expect(Math.abs(after!.updatedAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  test('DB-05 unique constraint on User.email is enforced at the database level', async ({
    repo,
    customer,
  }) => {
    const indexes = await repo.uniqueIndexes('User');

    expect(indexes.map((i) => i.indexdef).join('\n')).toMatch(
      /UNIQUE INDEX "User_email_key" ON public\."User" USING btree \(email\)/,
    );
    expect(await repo.countUsersByEmail(customer.user.email)).toBe(1);
  });

  test('DB-06 foreign keys protect order ↔ user ↔ product relationships', async ({ repo }) => {
    const constraints = await repo.constraints(['Order', 'OrderItem']);
    const fks = constraints
      .filter((c) => c.constraint_type === 'FOREIGN KEY')
      .map((c) => c.constraint_name);

    expect(fks.sort()).toEqual([
      'OrderItem_orderId_fkey',
      'OrderItem_productId_fkey',
      'Order_userId_fkey',
    ]);
  });

  test('DB-07 mandatory columns are NOT NULL; only Product.description is nullable', async ({
    repo,
  }) => {
    const columns = await repo.columns(['User', 'Product', 'Order', 'OrderItem']);
    const nullable = columns
      .filter((c) => c.is_nullable === 'YES')
      .map((c) => `${c.table_name}.${c.column_name}`);

    expect(nullable).toEqual(['Product.description']);
  });

  test('DB-08 no orphan records: every item has an order and a product, every order has a user and items', async ({
    repo,
  }) => {
    expect(await repo.orphanOrderItems()).toEqual([]);
    expect(await repo.ordersWithMissingUser()).toEqual([]);
    expect(await repo.ordersWithoutItems()).toEqual([]);
  });

  test('DB-09 soft delete keeps historical order items referencing the product', async ({
    api,
    admin,
    customer,
    createProduct,
    placeOrder,
    repo,
  }) => {
    const product = await createProduct();
    const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

    await api.as(admin).products.remove(product.id);

    expect((await repo.findProduct(product.id))?.isActive).toBe(false);
    expect((await repo.findOrderItems(order.id))[0]?.productId).toBe(product.id);
    const reread = await api.as(customer).orders.get(order.id);
    expect(reread.body.items[0]?.product.isActive).toBe(false);
  });

  test('DB-10 updates persist exactly the changed fields', async ({
    api,
    admin,
    createProduct,
    repo,
  }) => {
    const product = await createProduct({ priceCents: 1000, stock: 10 });

    await api.as(admin).products.update(product.id, { stock: 42 });

    expect(await repo.findProduct(product.id)).toMatchObject({
      stock: 42,
      priceCents: 1000,
      name: product.name,
    });
  });

  test('DB-11 duplicate registration does not create a second user row', async ({
    api,
    customer,
    data,
    repo,
  }) => {
    await api.auth.register(data.customer({ email: customer.user.email }));

    expect(await repo.countUsersByEmail(customer.user.email)).toBe(1);
  });

  test(
    'DB-12 the QA database role is read-only (safety guard)',
    { tag: Tag.security },
    async ({ db, repo }) => {
      const privileges = await repo.currentRolePrivileges();

      expect(new Set(privileges.map((p) => p.privilege_type))).toEqual(new Set(['SELECT']));
      await expect(db.query('UPDATE "Product" SET stock = stock WHERE false')).rejects.toThrow(
        /read-only transaction|permission denied/,
      );
    },
  );
});

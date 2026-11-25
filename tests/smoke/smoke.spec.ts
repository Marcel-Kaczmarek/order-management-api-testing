import { test, expect, Tag, Role } from '@src/fixtures';
import { env } from '@src/config/env';

/**
 * Smoke suite: the fastest signal that the environment and the critical path
 * work. Runs first in the PR pipeline; any failure stops the pipeline.
 */
test.describe('Smoke', { tag: [Tag.smoke, Tag.regression, Tag.api] }, () => {
  test('SMK-01 public catalog is reachable and paginated', async ({ api }) => {
    const result = await api.products.list({ limit: 5 });

    expect(result).toHaveStatus(200);
    expect(result.body).toMatchSchema('paginatedProducts');
    expect(result.body.data.length).toBeLessThanOrEqual(5);
  });

  test('SMK-02 seeded administrator can authenticate', async ({ api }) => {
    const result = await api.auth.login({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });

    // NestJS @Post() defaults to 201 – the AUT returns 201 for login (see test-strategy §14).
    expect(result).toHaveStatus(201);
    expect(result.body.user.role).toBe(Role.ADMIN);
  });

  test('SMK-03 a new customer can register and read their profile', async ({ api, customer }) => {
    const me = await api.as(customer).users.me();

    expect(me).toHaveStatus(200);
    expect(me.body).toMatchObject({
      id: customer.user.id,
      email: customer.user.email,
      role: Role.CUSTOMER,
    });
  });

  test('SMK-04 critical path: customer places an order for an in-stock product', async ({
    api,
    customer,
    createProduct,
  }) => {
    const product = await createProduct({ priceCents: 2500, stock: 10 });

    const order = await api
      .as(customer)
      .orders.create({ items: [{ productId: product.id, quantity: 2 }] });

    expect(order).toHaveStatus(201);
    expect(order.body).toMatchObject({
      status: 'PENDING',
      totalCents: 5000,
      userId: customer.user.id,
    });
  });

  test('SMK-05 OpenAPI document is published by the AUT', async ({ api }) => {
    const result = await api.raw.send<{ openapi: string; paths: Record<string, unknown> }>(
      'GET',
      'docs-json',
    );

    expect(result).toHaveStatus(200);
    expect(result.body.openapi).toMatch(/^3\./);
    expect(Object.keys(result.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/auth/login',
        '/api/products',
        '/api/orders',
        '/api/orders/{id}/status',
      ]),
    );
  });
});

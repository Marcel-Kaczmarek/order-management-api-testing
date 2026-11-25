import { test, expect, Tag } from '@src/fixtures';
import { validateSchema } from '@src/schemas/validator';

/**
 * Provider-side schema validation (JSON Schema + Ajv).
 *
 * This is *not* consumer-driven contract testing (e.g. Pact): there is no
 * consumer-published pact and no broker. These tests pin the provider's
 * current response shape so that breaking or additive changes are caught.
 */
test.describe(
  'Contract › response schemas',
  { tag: [Tag.contract, Tag.regression, Tag.api] },
  () => {
    test('CTR-01 POST /auth/register and /auth/login → authResponse', async ({ api, data }) => {
      const payload = data.customer();
      const register = await api.auth.register(payload);
      const login = await api.auth.login({ email: payload.email, password: payload.password });

      expect(register.body).toMatchSchema('authResponse');
      expect(login.body).toMatchSchema('authResponse');
    });

    test('CTR-02 GET /users/me → userProfile; GET /users → userProfile[]', async ({
      api,
      customer,
      admin,
    }) => {
      expect((await api.as(customer).users.me()).body).toMatchSchema('userProfile');
      expect((await api.as(admin).users.list()).body).toMatchSchema('userList');
    });

    test('CTR-03 product endpoints → product / paginatedProducts', async ({
      api,
      admin,
      createProduct,
    }) => {
      const product = await createProduct();

      expect((await api.products.get(product.id)).body).toMatchSchema('product');
      expect((await api.products.list({ limit: 10 })).body).toMatchSchema('paginatedProducts');
      expect((await api.as(admin).products.update(product.id, { stock: 3 })).body).toMatchSchema(
        'product',
      );
    });

    test('CTR-04 order endpoints → order / paginatedOrders (nested items and product)', async ({
      api,
      admin,
      customer,
      createProduct,
      placeOrder,
    }) => {
      const product = await createProduct();
      const order = await placeOrder(customer, [{ productId: product.id, quantity: 2 }]);

      expect(order).toMatchSchema('order');
      expect((await api.as(customer).orders.get(order.id)).body).toMatchSchema('order');
      expect((await api.as(customer).orders.list()).body).toMatchSchema('paginatedOrders');
      expect((await api.as(admin).orders.confirmPayment(order.id)).body).toMatchSchema('order');
    });

    test('CTR-05 every error status uses the same error envelope', async ({
      api,
      customer,
      data,
    }) => {
      const samples = [
        await api.auth.login({}), // 400
        await api.users.me(), // 401
        await api.as(customer).users.list(), // 403
        await api.products.get('cunknownunknownunknown0000'), // 404
        await api.auth.register(data.customer({ email: customer.user.email })), // 409
        await api.raw.send('GET', 'does-not-exist'), // 404 route
      ];

      expect(samples.map((s) => s.status)).toEqual([400, 401, 403, 404, 409, 404]);
      for (const sample of samples) expect(sample.body).toMatchSchema('error');
    });

    test('CTR-06 validation errors return message as a list of field messages', async ({ api }) => {
      const result = await api.auth.register({});

      expect(result).toBeApiError(400);
      expect(Array.isArray(result.error.message)).toBe(true);
      expect(result.error.message).toEqual(
        expect.arrayContaining(['email must be an email', 'password must be a string']),
      );
    });

    test('CTR-07 date fields are ISO-8601 UTC and identifiers are CUIDs', async ({
      createProduct,
    }) => {
      const product = await createProduct();

      expect(product.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(product.id).toMatch(/^c[a-z0-9]{24}$/);
    });

    test('CTR-08 schemas reject drift (self-test of the strict contract)', () => {
      // Guards the guard: a response gaining a sensitive field or losing a
      // required one must fail validation.
      const valid = {
        id: 'cabcdefghijklmnopqrstuvwx',
        email: 'a@b.co',
        name: 'Ab',
        role: 'CUSTOMER',
      };
      expect(validateSchema('authUser', valid).valid).toBe(true);
      expect(validateSchema('authUser', { ...valid, passwordHash: 'x' }).valid).toBe(false);
      expect(validateSchema('authUser', { ...valid, role: 'SUPERUSER' }).valid).toBe(false);
      const { email: _drop, ...missingEmail } = valid;
      expect(validateSchema('authUser', missingEmail).valid).toBe(false);
    });
  },
);

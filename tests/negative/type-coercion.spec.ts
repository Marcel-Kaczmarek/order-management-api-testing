import { test, expect, Tag } from '@src/fixtures';

/**
 * The AUT's global ValidationPipe runs with `transformOptions.enableImplicitConversion`,
 * so JSON values are converted to the DTO's declared type *before* validation.
 * These tests pin that observed contract (it is configured behaviour, not an
 * accident) so that a change in it is detected. The one harmful consequence –
 * the string "false" becoming boolean true – is tracked as BUG-011.
 */
test.describe(
  'Negative › implicit type conversion',
  { tag: [Tag.negative, Tag.regression, Tag.api] },
  () => {
    test('TYP-01 numeric strings are accepted for integer fields', async ({ api, admin, data }) => {
      const result = await api
        .as(admin)
        .products.create({ ...data.product(), priceCents: '1500', stock: '3' });

      expect(result).toHaveStatus(201);
      expect(result.body).toMatchObject({ priceCents: 1500, stock: 3 });
      await api.as(admin).products.remove(result.body.id);
    });

    test('TYP-02 non-numeric strings for integer fields are still rejected', async ({
      api,
      admin,
      data,
    }) => {
      const result = await api.as(admin).products.create({ ...data.product(), priceCents: 'abc' });

      expect(result).toBeApiError(400, /priceCents must be an integer number/);
    });

    test('TYP-03 numbers are converted to strings for string fields', async ({
      api,
      admin,
      data,
    }) => {
      const result = await api.as(admin).products.create({ ...data.product(), description: 42 });

      expect(result).toHaveStatus(201);
      expect(result.body.description).toBe('42');
      await api.as(admin).products.remove(result.body.id);
    });

    test('TYP-04 a numeric password is converted to a string and must still match', async ({
      api,
      data,
    }) => {
      const payload = data.customer({ password: '12345678' });
      await api.auth.register(payload);

      const login = await api.auth.login({ email: payload.email, password: 12345678 });

      expect(login).toHaveStatus(201);
    });

    test('TYP-05 genuine boolean false deactivates a product', async ({
      api,
      admin,
      createProduct,
    }) => {
      const product = await createProduct();

      const result = await api.as(admin).products.update(product.id, { isActive: false });

      expect(result.body.isActive).toBe(false);
    });
  },
);

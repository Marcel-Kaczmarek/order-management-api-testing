import { test, expect, Tag } from '@src/fixtures';
import { invalidProductPayloads } from '@src/factories';
import type { ApiResult, ProductClient } from '@src/clients';

test.describe('Products › CRUD', { tag: [Tag.api, Tag.regression] }, () => {
  test('PRD-01 admin creates a product; response mirrors the request', async ({
    api,
    admin,
    data,
  }) => {
    const payload = data.product();

    const result = await api.as(admin).products.create(payload);

    expect(result).toHaveStatus(201);
    expect(result.body).toMatchSchema('product');
    expect(result.body).toMatchObject({ ...payload, isActive: true });
    expect(result.body.createdAt).toBe(result.body.updatedAt);
    await api.as(admin).products.remove(result.body.id);
  });

  test('PRD-02 description is optional and stored as null', async ({ api, admin, data }) => {
    const { description: _omit, ...payload } = data.product();

    const result = await api.as(admin).products.create(payload);

    expect(result).toHaveStatus(201);
    expect(result.body.description).toBeNull();
    await api.as(admin).products.remove(result.body.id);
  });

  test('PRD-03 product can be retrieved by id anonymously', async ({ api, createProduct }) => {
    const product = await createProduct();

    const result = await api.products.get(product.id);

    expect(result).toHaveStatus(200);
    expect(result.body).toEqual(product);
  });

  test('PRD-04 PATCH performs a partial update and leaves other fields untouched', async ({
    api,
    admin,
    createProduct,
  }) => {
    const product = await createProduct({ priceCents: 1500, stock: 10 });

    const result = await api.as(admin).products.update(product.id, { priceCents: 1750 });

    expect(result).toHaveStatus(200);
    expect(result.body).toMatchObject({
      ...product,
      priceCents: 1750,
      updatedAt: expect.any(String),
    });
    expect(Date.parse(result.body.updatedAt)).toBeGreaterThan(Date.parse(product.updatedAt));
    expect(result.body.createdAt).toBe(product.createdAt);
  });

  test('PRD-05 PATCH with an empty body is a no-op that still succeeds', async ({
    api,
    admin,
    createProduct,
  }) => {
    const product = await createProduct();

    const result = await api.as(admin).products.update(product.id, {});

    expect(result).toHaveStatus(200);
    expect(result.body).toMatchObject({
      name: product.name,
      priceCents: product.priceCents,
      stock: product.stock,
    });
  });

  test(
    'PRD-06 DELETE soft-deletes: product leaves the catalog but the record remains',
    { tag: Tag.database },
    async ({ api, admin, createProduct, repo }) => {
      const product = await createProduct();

      const result = await api.as(admin).products.remove(product.id);

      expect(result).toHaveStatus(200);
      expect(result.body.isActive).toBe(false);
      const catalog = await api.products.list({ limit: 100 });
      expect(catalog.body.data.map((p) => p.id)).not.toContain(product.id);
      expect(await repo.findProduct(product.id)).toMatchObject({ id: product.id, isActive: false });
    },
  );

  test('PRD-07 deleting an already deleted product is idempotent (200, still inactive)', async ({
    api,
    admin,
    createProduct,
  }) => {
    const product = await createProduct();
    await api.as(admin).products.remove(product.id);

    const again = await api.as(admin).products.remove(product.id);

    expect(again).toHaveStatus(200);
    expect(again.body.isActive).toBe(false);
  });

  test('PRD-08 admin can re-activate a soft-deleted product', async ({
    api,
    admin,
    createProduct,
  }) => {
    const product = await createProduct();
    await api.as(admin).products.remove(product.id);

    const result = await api.as(admin).products.update(product.id, { isActive: true });

    expect(result).toHaveStatus(200);
    expect(result.body.isActive).toBe(true);
  });

  const UNKNOWN_ID = 'cunknownunknownunknown0000';
  const missingTargets: {
    op: string;
    call: (products: ProductClient) => Promise<ApiResult<unknown>>;
  }[] = [
    { op: 'GET', call: (p) => p.get(UNKNOWN_ID) },
    { op: 'PATCH', call: (p) => p.update(UNKNOWN_ID, { stock: 1 }) },
    { op: 'DELETE', call: (p) => p.remove(UNKNOWN_ID) },
  ];
  for (const { op, call } of missingTargets) {
    test(
      `PRD-09 ${op} on a non-existent id → 404`,
      { tag: Tag.negative },
      async ({ api, admin }) => {
        const result = await call(api.as(admin).products);

        expect(result).toBeApiError(404, /Product not found/);
      },
    );
  }

  test(
    'PRD-10 malformed identifiers are treated as not found, not as server errors',
    { tag: Tag.negative },
    async ({ api }) => {
      for (const id of [
        '123',
        'not-a-cuid',
        '00000000-0000-0000-0000-000000000000',
        "' OR '1'='1",
      ]) {
        const result = await api.products.get(id);
        expect(result, `id ${id}`).toBeApiError(404);
      }
    },
  );

  test('PRD-11 duplicate product names are accepted (no uniqueness rule in the AUT)', async ({
    api,
    admin,
    createProduct,
  }) => {
    // Observed behaviour, documented in docs/risk-assessment.md (R-09). Product names
    // are not a business key in this API, so this is recorded, not raised as a bug.
    const first = await createProduct();

    const second = await api
      .as(admin)
      .products.create({ name: first.name, priceCents: 999, stock: 1 });

    expect(second).toHaveStatus(201);
    expect(second.body.id).not.toBe(first.id);
    await api.as(admin).products.remove(second.body.id);
  });

  for (const { name, payload, field } of invalidProductPayloads()) {
    test(
      `PRD-12 create validation: ${name} → 400`,
      { tag: Tag.negative },
      async ({ api, admin }) => {
        const result = await api.as(admin).products.create(payload);

        expect(result).toBeApiError(400, new RegExp(field));
      },
    );
  }

  test(
    'PRD-13 update validation: negative stock and zero price are rejected',
    { tag: Tag.negative },
    async ({ api, admin, createProduct }) => {
      const product = await createProduct({ stock: 5, priceCents: 500 });

      const negativeStock = await api.as(admin).products.update(product.id, { stock: -1 });
      const zeroPrice = await api.as(admin).products.update(product.id, { priceCents: 0 });

      expect(negativeStock).toBeApiError(400, /stock must not be less than 0/);
      expect(zeroPrice).toBeApiError(400, /priceCents must not be less than 1/);
      expect(await api.products.get(product.id)).toMatchObject({
        body: { stock: 5, priceCents: 500 },
      });
    },
  );

  test('PRD-14 boundary values: price 1 cent and stock 0 are accepted', async ({
    createProduct,
  }) => {
    const product = await createProduct({ priceCents: 1, stock: 0 });

    expect(product).toMatchObject({ priceCents: 1, stock: 0 });
  });

  test(
    'PRD-15 server-managed fields cannot be set by the client',
    { tag: [Tag.negative, Tag.security] },
    async ({ api, admin, createProduct }) => {
      const product = await createProduct();

      const result = await api.as(admin).products.update(product.id, {
        id: 'chackedhackedhackedhacked0',
        createdAt: '2000-01-01T00:00:00.000Z',
      });

      expect(result).toBeApiError(400, /property id should not exist/);
    },
  );
});

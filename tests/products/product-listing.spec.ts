import { test, expect, Tag } from '@src/fixtures';
import { Pagination } from '@src/constants';

/**
 * Listing, pagination and query-parameter contract of GET /products.
 * The catalog is shared by parallel workers, so assertions are relative
 * (meta arithmetic, ordering, membership) rather than exact counts.
 */
test.describe('Products › listing & pagination', { tag: [Tag.api, Tag.regression] }, () => {
  test('LST-01 defaults: page=1, limit=20', async ({ api }) => {
    const result = await api.products.list();

    expect(result).toHaveStatus(200);
    expect(result.body.meta).toMatchObject({
      page: Pagination.DEFAULT_PAGE,
      limit: Pagination.DEFAULT_LIMIT,
    });
    expect(result.body.data.length).toBeLessThanOrEqual(Pagination.DEFAULT_LIMIT);
  });

  test('LST-02 meta.totalPages = ceil(total / limit)', async ({ api, createProduct }) => {
    await createProduct();

    const result = await api.products.list({ limit: 3 });

    const { total, limit, totalPages } = result.body.meta;
    expect(totalPages).toBe(Math.ceil(total / limit));
    expect(result.body.data).toHaveLength(Math.min(3, total));
  });

  test('LST-03 results are ordered by createdAt descending (newest first)', async ({
    api,
    createProduct,
  }) => {
    await createProduct();
    await createProduct();

    const result = await api.products.list({ limit: 50 });

    const timestamps = result.body.data.map((p) => Date.parse(p.createdAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  test('LST-04 a newly created product appears in the catalog', async ({ api, createProduct }) => {
    const product = await createProduct();

    const result = await api.products.list({ limit: 100 });

    expect(result.body.data.map((p) => p.id)).toContain(product.id);
  });

  test('LST-05 only active products are listed', async ({ api }) => {
    const result = await api.products.list({ limit: 100 });

    expect(result.body.data.every((p) => p.isActive)).toBe(true);
  });

  test('LST-06 a page beyond the last one returns an empty data array', async ({ api }) => {
    // A fixed far-away page keeps the test independent of parallel product creation.
    const beyond = await api.products.list({ page: 100_000, limit: 100 });

    expect(beyond).toHaveStatus(200);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta.page).toBe(100_000);
    expect(beyond.body.meta.totalPages).toBeLessThan(100_000);
  });

  test('LST-07 maximum page size (100) is accepted', async ({ api }) => {
    const result = await api.products.list({ limit: Pagination.MAX_LIMIT });

    expect(result).toHaveStatus(200);
    expect(result.body.meta.limit).toBe(100);
  });

  const invalidQueries: {
    name: string;
    query: Record<string, string | number>;
    message: RegExp;
  }[] = [
    {
      name: 'limit above maximum (101)',
      query: { limit: 101 },
      message: /limit must not be greater than 100/,
    },
    { name: 'limit zero', query: { limit: 0 }, message: /limit must not be less than 1/ },
    { name: 'page zero', query: { page: 0 }, message: /page must not be less than 1/ },
    { name: 'negative page', query: { page: -1 }, message: /page must not be less than 1/ },
    { name: 'non-numeric limit', query: { limit: 'ten' }, message: /limit must be an integer/ },
    { name: 'fractional page', query: { page: 1.5 }, message: /page must be an integer/ },
  ];
  for (const { name, query, message } of invalidQueries) {
    test(`LST-08 invalid pagination: ${name} → 400`, { tag: Tag.negative }, async ({ api }) => {
      const result = await api.products.list(query);

      expect(result).toBeApiError(400, message);
    });
  }

  test(
    'LST-09 unsupported filter/sort parameters are rejected explicitly, not silently ignored',
    { tag: Tag.negative },
    async ({ api }) => {
      // The AUT does not implement filtering or sorting. The global ValidationPipe
      // (forbidNonWhitelisted) turns unknown query params into a 400 – a safe failure mode.
      const sort = await api.products.list({ sort: 'priceCents' });
      const filter = await api.products.list({ name: 'Monitor' });

      expect(sort).toBeApiError(400, /property sort should not exist/);
      expect(filter).toBeApiError(400, /property name should not exist/);
    },
  );
});

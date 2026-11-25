import { test, expect, Tag, Defect, PG_INT4_MAX, expectInventoryConserved } from '@src/fixtures';

/**
 * Reproduction tests for verified application defects (docs/bug-reports/).
 *
 * Each test asserts the CORRECT (expected) behaviour and is marked with
 * `test.fail()`: while the defect exists, the test fails "as expected" and the
 * build stays green *without hiding anything* – the report lists it as an
 * expected failure with its bug ID. When the defect is fixed the test starts
 * passing, Playwright reports it as an unexpected pass, the build turns red,
 * and the `test.fail()` marker must be removed – turning it into a permanent
 * regression test.
 */
test.describe('Regression › known defects', { tag: [Tag.knownDefect, Tag.regression] }, () => {
  test(
    `${Defect.DUPLICATE_LINE_ITEM_OVERSELL} repeated line items bypass the stock check and drive stock negative`,
    {
      tag: [Tag.api, Tag.database],
      annotation: {
        type: 'defect',
        description: `${Defect.DUPLICATE_LINE_ITEM_OVERSELL} docs/bug-reports/BUG-001-duplicate-line-items-oversell.md`,
      },
    },
    async ({ api, customer, createProduct, repo }) => {
      test.fail(true, `${Defect.DUPLICATE_LINE_ITEM_OVERSELL} open`);
      const product = await createProduct({ stock: 5 });

      const result = await api.as(customer).orders.create({
        items: [
          { productId: product.id, quantity: 3 },
          { productId: product.id, quantity: 3 },
        ],
      });

      // Expected: 6 units requested of 5 in stock → rejected, inventory untouched.
      expect(result).toBeApiError(400, /Insufficient stock/);
      expect((await repo.findProduct(product.id))?.stock).toBe(5);
      await expectInventoryConserved(repo, product, 5);
    },
  );

  test(
    `${Defect.CANCEL_NO_RESTOCK} cancelling an order does not return reserved units to inventory`,
    {
      tag: [Tag.api, Tag.database, Tag.integration],
      annotation: {
        type: 'defect',
        description: `${Defect.CANCEL_NO_RESTOCK} docs/bug-reports/BUG-003-cancellation-does-not-restock.md`,
      },
    },
    async ({ api, admin, customer, createProduct, placeOrder, repo }) => {
      test.fail(true, `${Defect.CANCEL_NO_RESTOCK} open`);
      const product = await createProduct({ stock: 10 });
      const order = await placeOrder(customer, [{ productId: product.id, quantity: 4 }]);
      expect((await repo.findProduct(product.id))?.stock).toBe(6);

      const cancelled = await api.as(admin).orders.cancel(order.id);

      expect(cancelled).toHaveStatus(200);
      // Expected: the 4 reserved units become sellable again.
      expect((await repo.findProduct(product.id))?.stock).toBe(10);
    },
  );

  test(
    `${Defect.INT_OVERFLOW_500} out-of-range integers cause 500 Internal Server Error instead of 400`,
    {
      tag: [Tag.api, Tag.negative],
      annotation: {
        type: 'defect',
        description: `${Defect.INT_OVERFLOW_500} docs/bug-reports/BUG-004-integer-overflow-500.md`,
      },
    },
    async ({ api, admin, customer, createProduct }) => {
      test.fail(true, `${Defect.INT_OVERFLOW_500} open`);
      const createTooExpensive = await api
        .as(admin)
        .products.create({ name: 'QA-Overflow price', priceCents: PG_INT4_MAX + 1, stock: 1 });
      const pricey = await createProduct({ priceCents: PG_INT4_MAX - 1, stock: 10 });
      const overflowTotal = await api
        .as(customer)
        .orders.create({ items: [{ productId: pricey.id, quantity: 2 }] });

      // Expected: client input errors are reported as 400 with a field message.
      expect.soft(createTooExpensive).toBeApiError(400, /priceCents/);
      expect.soft(overflowTotal).toBeApiError(400);
    },
  );

  test(
    `${Defect.INACTIVE_PRODUCT_VISIBLE} soft-deleted products remain publicly readable by id`,
    {
      tag: [Tag.api],
      annotation: {
        type: 'defect',
        description: `${Defect.INACTIVE_PRODUCT_VISIBLE} docs/bug-reports/BUG-005-inactive-product-publicly-visible.md`,
      },
    },
    async ({ api, admin, createProduct }) => {
      test.fail(true, `${Defect.INACTIVE_PRODUCT_VISIBLE} open`);
      const product = await createProduct();
      await api.as(admin).products.remove(product.id);

      const anonymous = await api.products.get(product.id);

      // Expected per AUT README ("public/customer reads active catalog"): not found for the public.
      expect(anonymous).toBeApiError(404, /Product not found/);
    },
  );

  test(
    `${Defect.PAYLOAD_TOO_LARGE_500} oversized JSON bodies return 500 instead of 413`,
    {
      tag: [Tag.api, Tag.negative, Tag.security],
      annotation: {
        type: 'defect',
        description: `${Defect.PAYLOAD_TOO_LARGE_500} docs/bug-reports/BUG-008-payload-too-large-500.md`,
      },
    },
    async ({ api, customer }) => {
      test.fail(true, `${Defect.PAYLOAD_TOO_LARGE_500} open`);
      // ~1 MB body; Express' default JSON limit is 100 kB.
      const items = Array.from({ length: 20_000 }, () => ({
        productId: 'cplaceholderplaceholder000',
        quantity: 1,
      }));

      const result = await api.as(customer).orders.create({ items });

      expect(result).toBeApiError(413);
    },
  );

  test(
    `${Defect.NUL_BYTE_500} a NUL byte in a path parameter causes 500`,
    {
      tag: [Tag.api, Tag.negative, Tag.security],
      annotation: {
        type: 'defect',
        description: `${Defect.NUL_BYTE_500} docs/bug-reports/BUG-009-nul-byte-500.md`,
      },
    },
    async ({ api, customer }) => {
      test.fail(true, `${Defect.NUL_BYTE_500} open`);
      // raw.send keeps "%00" as a literal percent-encoded NUL (the typed clients
      // would encode "%" itself, sending the harmless string "%00").
      const product = await api.raw.send('GET', 'products/%00');
      const order = await api.as(customer).raw.send('GET', 'orders/abc%00def');

      // Expected: unknown identifiers are "not found" (as for any other malformed id).
      expect.soft(product).toBeApiError(404);
      expect.soft(order).toBeApiError(404);
    },
  );

  test(
    `${Defect.UNAUTHORIZED_ERROR_LABEL} 401 responses from the JWT guard are labelled "Internal Server Error"`,
    {
      tag: [Tag.api, Tag.contract, Tag.authentication],
      annotation: {
        type: 'defect',
        description: `${Defect.UNAUTHORIZED_ERROR_LABEL} docs/bug-reports/BUG-010-401-error-label.md`,
      },
    },
    async ({ api }) => {
      test.fail(true, `${Defect.UNAUTHORIZED_ERROR_LABEL} open`);
      const result = await api.users.me();

      expect(result.status).toBe(401);
      // Expected: the envelope's `error` matches the status (as it does for 400/403/404/409).
      expect(result.error.error).toBe('Unauthorized');
    },
  );

  test(
    `${Defect.STRING_FALSE_COERCED_TRUE} the string "false" is coerced to boolean true for isActive`,
    {
      tag: [Tag.api, Tag.database],
      annotation: {
        type: 'defect',
        description: `${Defect.STRING_FALSE_COERCED_TRUE} docs/bug-reports/BUG-011-string-false-coerced-to-true.md`,
      },
    },
    async ({ api, admin, createProduct, repo }) => {
      test.fail(true, `${Defect.STRING_FALSE_COERCED_TRUE} open`);
      const product = await createProduct();

      const result = await api.as(admin).products.update(product.id, { isActive: 'false' });

      // Expected: either reject the wrong type (400) or interpret it as false –
      // never silently store the opposite value.
      expect((await repo.findProduct(product.id))?.isActive, `HTTP ${result.status}`).not.toBe(
        true,
      );
    },
  );
});

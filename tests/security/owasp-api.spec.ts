import { test, expect, Tag } from '@src/fixtures';

/**
 * Non-destructive checks inspired by the OWASP API Security Top 10 (2023).
 * Executed ONLY against the local, disposable environment (enforced by the
 * environment guard in src/config/env.ts).
 */
const SQLI_PAYLOADS = [
  "' OR '1'='1",
  '\'; DROP TABLE "User"; --',
  '" OR ""="',
  '1\' UNION SELECT passwordHash FROM "User"--',
];

test.describe('Security › OWASP API Top 10', { tag: [Tag.security, Tag.regression] }, () => {
  test('SEC-01 API3 excessive data exposure: user listing never returns password hashes', async ({
    api,
    admin,
  }) => {
    const result = await api.as(admin).users.list();

    expect(result).toHaveStatus(200);
    expect(result.body).toExposeNoSensitiveFields();
    expect(result.rawText).not.toMatch(/\$2[aby]\$\d{2}\$/);
  });

  test('SEC-02 API3: order responses do not embed the owner’s account data', async ({
    customer,
    createProduct,
    placeOrder,
  }) => {
    const product = await createProduct();
    const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

    expect(order).toExposeNoSensitiveFields();
    expect(order).not.toHaveProperty('user');
    expect(JSON.stringify(order)).not.toContain(customer.user.email);
  });

  for (const payload of SQLI_PAYLOADS) {
    test(
      `SEC-03 SQL injection in login is handled as data: ${payload}`,
      { tag: Tag.negative },
      async ({ api }) => {
        const asEmail = await api.auth.login({ email: payload, password: 'Password123!' });
        const asPassword = await api.auth.login({
          email: 'admin@orderflow.dev',
          password: `${payload}xxxxxxxx`,
        });

        expect(asEmail).toBeApiError(400, /email must be an email/);
        expect(asPassword).toBeApiError(401, /Invalid credentials/);
      },
    );
  }

  test(
    'SEC-04 SQL injection strings are stored and returned literally (parameterized queries)',
    { tag: Tag.database },
    async ({ createProduct, repo }) => {
      const product = await createProduct({ description: SQLI_PAYLOADS.join(' | ') });

      expect((await repo.findProduct(product.id))?.description).toBe(SQLI_PAYLOADS.join(' | '));
      expect(await repo.tableExists('User')).toBe(true);
    },
  );

  test('SEC-05 script payloads are returned as JSON data with a JSON content type', async ({
    api,
    createProduct,
  }) => {
    const xss = '<script>alert(document.cookie)</script>';
    const product = await createProduct({ description: xss });

    const result = await api.products.get(product.id);

    expect(result.headers['content-type']).toMatch(/^application\/json/);
    expect(result.body.description).toBe(xss);
  });

  test(
    'SEC-06 API8 errors never leak stack traces, SQL or ORM internals',
    { tag: Tag.negative },
    async ({ api, admin }) => {
      const probes = [
        await api
          .as(admin)
          .products.create({ name: 'QA-overflow', priceCents: 99_999_999_999, stock: 1 }),
        await api.raw.send('POST', 'auth/login', {
          data: '{"email": "broken',
          headers: { 'Content-Type': 'application/json' },
        }),
        await api.raw.send('GET', 'products/%00'),
      ];

      for (const probe of probes) {
        expect(probe.status, probe.url).toBeGreaterThanOrEqual(400);
        expect(probe.rawText).not.toMatch(
          /prisma|invalid `|at [\w.]+ \(|node_modules|SELECT |INSERT |PrismaClient|\.ts:\d+/i,
        );
      }
    },
  );

  test(
    'SEC-07 API4 unrestricted resource consumption: page size is capped',
    { tag: Tag.negative },
    async ({ api }) => {
      const result = await api.products.list({ limit: 1_000_000 });

      expect(result).toBeApiError(400, /limit must not be greater than 100/);
    },
  );

  test(
    'SEC-08 API4: oversized request bodies are rejected and create nothing',
    { tag: [Tag.negative, Tag.database] },
    async ({ api, customer, repo }) => {
      // The status code (500 instead of 413) is tracked as BUG-008 in the known-defect
      // pack; this test guards the security property: the body never reaches business logic.
      const items = Array.from({ length: 20_000 }, () => ({
        productId: 'cplaceholderplaceholder000',
        quantity: 1,
      }));

      const result = await api.as(customer).orders.create({ items });

      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.rawText).not.toMatch(/PayloadTooLarge|stack|node_modules/i);
      expect(await repo.ordersForUser(customer.user.id)).toEqual([]);
    },
  );

  test('SEC-09 API2 brute force: repeated failed logins stay generic; rate limiting is not implemented', async ({
    api,
    customer,
  }) => {
    // Observation, not an invented requirement: the AUT has no throttling, so
    // all attempts are answered (no 429). Recorded as risk R-07 / finding SEC-F02.
    const attempts = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        api.auth.login({ email: customer.user.email, password: `Wrong-${i}-pass` }),
      ),
    );

    const statuses = new Set(attempts.map((a) => a.status));
    test
      .info()
      .annotations.push({ type: 'observed', description: `statuses=${[...statuses].join(',')}` });
    expect([...statuses]).toEqual([401]);
    // The real password still works afterwards (no lockout).
    expect(
      await api.auth.login({ email: customer.user.email, password: customer.password }),
    ).toHaveStatus(201);
  });

  test(
    'SEC-12 API8 security misconfiguration: no framework fingerprinting and basic hardening headers',
    {
      tag: Tag.knownDefect,
      annotation: {
        type: 'defect',
        description: 'SEC-F01 docs/bug-reports/SEC-F01-missing-security-headers.md',
      },
    },
    async ({ api }) => {
      test.fail(true, 'SEC-F01 open: X-Powered-By disclosed, no helmet-style headers');
      const result = await api.products.list({ limit: 1 });

      test.info().annotations.push({
        type: 'observed',
        description: `x-powered-by=${result.headers['x-powered-by']} nosniff=${result.headers['x-content-type-options']}`,
      });
      expect.soft(result.headers['x-powered-by'], 'framework fingerprint').toBeUndefined();
      expect.soft(result.headers['x-content-type-options']).toBe('nosniff');
    },
  );

  test('SEC-10 CORS is not opened to arbitrary origins', async ({ api }) => {
    const result = await api.products.list({}, { headers: { Origin: 'https://evil.example' } });

    expect(result.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('SEC-11 API5 BFLA via HTTP method override headers is not possible', async ({
    api,
    customer,
    createProduct,
  }) => {
    const product = await createProduct();

    const result = await api.as(customer).raw.send('POST', `products/${product.id}`, {
      headers: { 'X-HTTP-Method-Override': 'DELETE' },
    });

    expect([403, 404]).toContain(result.status);
    expect((await api.products.get(product.id)).body.isActive).toBe(true);
  });
});

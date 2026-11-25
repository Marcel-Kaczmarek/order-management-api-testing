import { test, expect, Tag } from '@src/fixtures';

/**
 * HTTP protocol-level negative scenarios: methods, content types, malformed
 * bodies and unknown routes. Expected codes reflect the AUT's actual contract
 * (NestJS/Express defaults); deviations from REST conventions are documented.
 */
test.describe('Negative › HTTP protocol', { tag: [Tag.negative, Tag.regression, Tag.api] }, () => {
  test('NEG-01 malformed JSON body → 400 in the standard envelope', async ({ api }) => {
    const result = await api.raw.send('POST', 'auth/login', {
      data: '{"email": "a@b.co", "password": ',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(result).toBeApiError(400);
  });

  test('NEG-02 unsupported content type is not parsed – request fails validation (400, not 415)', async ({
    api,
  }) => {
    // Express only parses JSON/urlencoded bodies; a text/plain body arrives as {}
    // and fails DTO validation. The AUT never answers 415. See test-strategy §Status codes.
    const result = await api.raw.send('POST', 'auth/login', {
      data: 'email=admin@orderflow.dev&password=Admin123!',
      headers: { 'Content-Type': 'text/plain' },
    });

    expect(result).toBeApiError(400, /email must be an email/);
  });

  test('NEG-03 form-urlencoded bodies are accepted (Express default parser)', async ({ api }) => {
    const result = await api.raw.send('POST', 'auth/login', {
      data: 'email=admin%40orderflow.dev&password=Admin123%21',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    expect(result).toHaveStatus(201);
  });

  const unsupported: [method: 'PUT' | 'DELETE' | 'PATCH' | 'POST', path: string][] = [
    ['PUT', 'products/cunknownunknownunknown0000'],
    ['DELETE', 'orders/cunknownunknownunknown0000'],
    ['PATCH', 'users/me'],
    ['POST', 'users'],
    ['PUT', 'orders/cunknownunknownunknown0000/status'],
  ];
  for (const [method, path] of unsupported) {
    test(`NEG-04 unsupported method ${method} /${path.split('/')[0]} → 404 (NestJS has no 405)`, async ({
      api,
      admin,
    }) => {
      const result = await api.as(admin).raw.send(method, path, { data: {} });

      expect(result).toBeApiError(404, new RegExp(`Cannot ${method}`));
    });
  }

  test('NEG-05 unknown route → 404 envelope with the requested path', async ({ api }) => {
    const result = await api.raw.send('GET', 'inventory');

    expect(result).toBeApiError(404, /Cannot GET \/api\/inventory/);
    expect(result.error.path).toBe('/api/inventory');
  });

  test('NEG-06 empty JSON body on create endpoints lists every missing field', async ({
    api,
    admin,
  }) => {
    const result = await api.as(admin).products.create({});

    expect(result).toBeApiError(400);
    const messages = (result.error.message as string[]).join(' | ');
    for (const field of ['name', 'priceCents', 'stock']) expect(messages).toContain(field);
  });

  test('NEG-07 JSON array instead of object is rejected', async ({ api, admin }) => {
    const result = await api.as(admin).raw.send('POST', 'products', { data: [{ name: 'QA-x' }] });

    expect(result.status).toBe(400);
  });

  test('NEG-08 HEAD on a public collection behaves like GET without a body', async ({ api }) => {
    const result = await api.raw.send('HEAD', 'products');

    expect(result.status).toBe(200);
    expect(result.rawText).toBe('');
  });
});

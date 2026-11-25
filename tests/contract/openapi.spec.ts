import { test, expect, Tag } from '@src/fixtures';

interface OpenApiOperation {
  security?: Record<string, unknown>[];
  requestBody?: unknown;
}
interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    schemas: Record<
      string,
      { required?: string[]; properties?: Record<string, { enum?: string[] }> }
    >;
  };
}

/**
 * Checks the framework's assumptions against the AUT's published OpenAPI
 * document (/api/docs-json), so that a change in the provider's declared API
 * surface is detected before it silently invalidates tests.
 */
test.describe(
  'Contract › OpenAPI document',
  { tag: [Tag.contract, Tag.regression, Tag.api] },
  () => {
    let doc: OpenApiDocument;

    test.beforeEach(async ({ api }) => {
      const result = await api.raw.send<OpenApiDocument>('GET', 'docs-json');
      expect(result).toHaveStatus(200);
      doc = result.body;
    });

    test('OAS-01 every operation exercised by this framework is declared', () => {
      const declared = Object.entries(doc.paths).flatMap(([path, ops]) =>
        Object.keys(ops).map((method) => `${method.toUpperCase()} ${path}`),
      );

      expect(declared.sort()).toEqual(
        [
          'POST /api/auth/register',
          'POST /api/auth/login',
          'GET /api/users/me',
          'GET /api/users',
          'GET /api/products',
          'POST /api/products',
          'GET /api/products/{id}',
          'PATCH /api/products/{id}',
          'DELETE /api/products/{id}',
          'POST /api/orders',
          'GET /api/orders',
          'GET /api/orders/{id}',
          'PATCH /api/orders/{id}/status',
        ].sort(),
      );
    });

    test('OAS-02 protected operations declare bearer security; public ones do not', () => {
      const secured = (path: string, method: string) =>
        (doc.paths[path]?.[method]?.security ?? []).length > 0;

      expect(secured('/api/orders', 'post')).toBe(true);
      expect(secured('/api/orders/{id}/status', 'patch')).toBe(true);
      expect(secured('/api/products', 'post')).toBe(true);
      expect(secured('/api/users', 'get')).toBe(true);
      expect(secured('/api/products', 'get')).toBe(false);
      expect(secured('/api/auth/login', 'post')).toBe(false);
    });

    test('OAS-03 declared order-status enum matches the framework’s state model', () => {
      const statusEnum = doc.components.schemas.UpdateOrderStatusDto?.properties?.status?.enum;

      expect(statusEnum).toEqual(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED']);
    });

    test('OAS-04 request DTO required fields match the framework’s models', () => {
      const required = (name: string) => [...(doc.components.schemas[name]?.required ?? [])].sort();

      expect(required('RegisterDto')).toEqual(['email', 'name', 'password']);
      expect(required('LoginDto')).toEqual(['email', 'password']);
      expect(required('CreateProductDto')).toEqual(['name', 'priceCents', 'stock']);
      expect(required('CreateOrderDto')).toEqual(['items']);
    });

    test('OAS-05 response schemas are NOT declared – a documented contract gap', () => {
      // The AUT's controllers have no @ApiResponse decorators, so the OpenAPI
      // document cannot serve as a response contract. This is why the framework
      // maintains its own JSON Schemas (src/schemas). Recorded in docs/test-strategy.md.
      const responsesWithSchema = Object.values(doc.paths)
        .flatMap((ops) => Object.values(ops))
        .filter((op) =>
          JSON.stringify((op as { responses?: unknown }).responses ?? {}).includes('"schema"'),
        );

      expect(responsesWithSchema).toHaveLength(0);
    });
  },
);

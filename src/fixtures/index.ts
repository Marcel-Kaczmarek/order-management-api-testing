import {
  test as base,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { ApiClients, HttpRecorder } from '@src/clients';
import { apiRoot, env } from '@src/config/env';
import { DbClient } from '@src/database/DbClient';
import { OrderRepository } from '@src/database/OrderRepository';
import { TestDataFactory } from '@src/factories';
import type { CreateProductRequest, Order, OrderItemRequest, Product, Session } from '@src/models';
import { logger } from '@src/utilities/logger';
import { expect } from '@src/assertions';

interface WorkerFixtures {
  workerRequest: APIRequestContext;
  adminSession: Session;
  db: DbClient;
  repo: OrderRepository;
}

interface TestFixtures {
  recorder: HttpRecorder;
  api: ApiClients;
  data: TestDataFactory;
  /** A brand-new CUSTOMER registered through the public API for this test only. */
  customer: Session;
  /** A second, unrelated CUSTOMER – used for horizontal-privilege (BOLA) tests. */
  otherCustomer: Session;
  admin: Session;
  /** Registers additional customers on demand. */
  registerCustomer: () => Promise<Session>;
  /** Creates a product as ADMIN; it is soft-deleted automatically after the test. */
  createProduct: (overrides?: Partial<CreateProductRequest>) => Promise<Product>;
  /** Places an order as the given customer and asserts it was created. */
  placeOrder: (actor: Session, items: OrderItemRequest[]) => Promise<Order>;
  httpDiagnostics: void;
}

async function register(api: ApiClients, data: TestDataFactory): Promise<Session> {
  const payload = data.customer();
  const result = await api.auth.register(payload);
  if (result.status !== 201) {
    throw new Error(
      `Fixture could not register a customer: HTTP ${result.status} ${result.rawText}`,
    );
  }
  return { token: result.body.accessToken, user: result.body.user, password: payload.password };
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  /* ------------------------------ worker scope ------------------------------ */
  workerRequest: [
    async ({}, use) => {
      const context = await playwrightRequest.newContext({ baseURL: apiRoot });
      await use(context);
      await context.dispose();
    },
    { scope: 'worker' },
  ],

  adminSession: [
    async ({ workerRequest }, use) => {
      const api = new ApiClients(workerRequest);
      const result = await api.auth.login({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
      if (result.status !== 201) {
        throw new Error(
          `Admin login failed (HTTP ${result.status}). Is the AUT seeded? Run "npm run setup".`,
        );
      }
      await use({
        token: result.body.accessToken,
        user: result.body.user,
        password: env.ADMIN_PASSWORD,
      });
    },
    { scope: 'worker' },
  ],

  db: [
    async ({}, use) => {
      const db = new DbClient();
      await use(db);
      await db.close();
    },
    { scope: 'worker' },
  ],

  repo: [async ({ db }, use) => use(new OrderRepository(db)), { scope: 'worker' }],

  /* ------------------------------- test scope ------------------------------- */
  recorder: async ({}, use) => use(new HttpRecorder()),

  api: async ({ request, recorder }, use) => use(new ApiClients(request, recorder)),

  data: async ({}, use, testInfo) => use(new TestDataFactory(testInfo.testId)),

  admin: async ({ adminSession }, use) => use(adminSession),

  registerCustomer: async ({ api, data }, use) => use(() => register(api, data)),

  customer: async ({ registerCustomer }, use) => use(await registerCustomer()),

  otherCustomer: async ({ registerCustomer }, use) => use(await registerCustomer()),

  createProduct: async ({ api, data, adminSession }, use) => {
    const created: string[] = [];
    await use(async (overrides = {}) => {
      const result = await api.as(adminSession).products.create(data.product(overrides));
      expect(result, 'fixture: create product').toHaveStatus(201);
      created.push(result.body.id);
      return result.body;
    });
    // Automatic cleanup. The AUT only supports soft delete, which removes the
    // product from the public catalog while preserving order history (FK RESTRICT).
    for (const id of created) {
      const result = await api.as(adminSession).products.remove(id);
      if (result.status !== 200)
        logger.warn('cleanup: product soft-delete failed', { id, status: result.status });
    }
  },

  placeOrder: async ({ api }, use) => {
    await use(async (actor, items) => {
      const result = await api.as(actor).orders.create({ items });
      expect(result, 'fixture: place order').toHaveStatus(201);
      return result.body;
    });
  },

  /**
   * Attaches sanitized HTTP exchanges to the report when a test does not pass,
   * and always for known-defect tests (as reproduction evidence).
   */
  httpDiagnostics: [
    async ({ recorder }, use, testInfo) => {
      await use();
      const unexpected = testInfo.status !== testInfo.expectedStatus;
      const isDefectEvidence = testInfo.annotations.some((a) => a.type === 'defect');
      if ((unexpected || isDefectEvidence) && recorder.exchanges.length > 0) {
        await testInfo.attach('http-exchanges.json', {
          body: JSON.stringify(recorder.exchanges, null, 2),
          contentType: 'application/json',
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
export * from '@src/assertions/business';
export {
  Tag,
  Defect,
  OrderStatus,
  Role,
  HttpStatus,
  PG_INT4_MAX,
  ALLOWED_TRANSITIONS,
} from '@src/constants';

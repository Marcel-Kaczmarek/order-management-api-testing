import { Faker, en } from '@faker-js/faker';
import { env } from '@src/config/env';
import { TEST_DATA_PREFIX } from '@src/constants';
import type {
  CreateOrderRequest,
  CreateProductRequest,
  OrderItemRequest,
  RegisterRequest,
} from '@src/models';

/**
 * Test data factories.
 *
 * Reproducibility vs. uniqueness:
 * - Content (names, prices, descriptions) comes from a Faker instance seeded
 *   with FAKER_SEED + a per-test salt, so a given test generates the same
 *   values on every run.
 * - Identity fields that hit unique constraints (email) additionally embed a
 *   run token + monotonic counter, because the database persists between runs.
 */
const RUN_TOKEN = Date.now().toString(36);
let counter = 0;
const nextUnique = () => `${RUN_TOKEN}${process.pid.toString(36)}${(counter++).toString(36)}`;

function hash(text: string): number {
  let h = 0;
  for (const char of text) h = (Math.imul(31, h) + char.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export class TestDataFactory {
  readonly faker: Faker;

  /** @param salt usually the Playwright testId, giving each test its own deterministic stream. */
  constructor(salt = 'default') {
    this.faker = new Faker({ locale: [en] });
    this.faker.seed(env.FAKER_SEED + hash(salt));
  }

  uniqueEmail(prefix = 'qa.customer'): string {
    return `${prefix}.${nextUnique()}@example.test`;
  }

  customer(overrides: Partial<RegisterRequest> = {}): RegisterRequest {
    return {
      email: this.uniqueEmail(),
      name: this.faker.person.fullName(),
      password: `Qa!${this.faker.string.alphanumeric(12)}`,
      ...overrides,
    };
  }

  product(overrides: Partial<CreateProductRequest> = {}): CreateProductRequest {
    return {
      name: `${TEST_DATA_PREFIX}${this.faker.commerce.productName()} ${nextUnique()}`,
      description: this.faker.commerce.productDescription(),
      priceCents: this.faker.number.int({ min: 100, max: 50_000 }),
      stock: this.faker.number.int({ min: 20, max: 200 }),
      ...overrides,
    };
  }

  orderItem(productId: string, quantity = 1): OrderItemRequest {
    return { productId, quantity };
  }

  order(items: OrderItemRequest[]): CreateOrderRequest {
    return { items };
  }
}

/** Boundary-value datasets derived from the AUT's class-validator DTOs. */
export const Boundaries = {
  register: {
    passwordMinLength: 8,
    nameMinLength: 2,
  },
  product: {
    nameMinLength: 2,
    minPriceCents: 1,
    minStock: 0,
  },
  order: {
    minQuantity: 1,
    minItems: 1,
  },
} as const;

/** Invalid order payloads with the reason each one must be rejected. */
export const invalidOrderPayloads = (productId: string): { name: string; payload: unknown }[] => [
  { name: 'empty body', payload: {} },
  { name: 'items is not an array', payload: { items: 'not-an-array' } },
  { name: 'empty items array', payload: { items: [] } },
  { name: 'zero quantity', payload: { items: [{ productId, quantity: 0 }] } },
  { name: 'negative quantity', payload: { items: [{ productId, quantity: -3 }] } },
  { name: 'fractional quantity', payload: { items: [{ productId, quantity: 1.5 }] } },
  { name: 'quantity as string', payload: { items: [{ productId, quantity: 'two' }] } },
  { name: 'missing productId', payload: { items: [{ quantity: 1 }] } },
  { name: 'numeric productId', payload: { items: [{ productId: 12345, quantity: 1 }] } },
  { name: 'missing quantity', payload: { items: [{ productId }] } },
  { name: 'null item', payload: { items: [null] } },
];

/** Invalid product payloads (admin) with the field expected in the validation message. */
export const invalidProductPayloads = (): {
  name: string;
  payload: Record<string, unknown>;
  field: string;
}[] => [
  { name: 'missing name', payload: { priceCents: 1000, stock: 1 }, field: 'name' },
  {
    name: 'name below min length',
    payload: { name: 'A', priceCents: 1000, stock: 1 },
    field: 'name',
  },
  { name: 'missing priceCents', payload: { name: 'QA-Valid', stock: 1 }, field: 'priceCents' },
  {
    name: 'zero priceCents',
    payload: { name: 'QA-Valid', priceCents: 0, stock: 1 },
    field: 'priceCents',
  },
  {
    name: 'negative priceCents',
    payload: { name: 'QA-Valid', priceCents: -1, stock: 1 },
    field: 'priceCents',
  },
  {
    name: 'decimal priceCents',
    payload: { name: 'QA-Valid', priceCents: 10.5, stock: 1 },
    field: 'priceCents',
  },
  { name: 'missing stock', payload: { name: 'QA-Valid', priceCents: 1000 }, field: 'stock' },
  {
    name: 'negative stock',
    payload: { name: 'QA-Valid', priceCents: 1000, stock: -1 },
    field: 'stock',
  },
];

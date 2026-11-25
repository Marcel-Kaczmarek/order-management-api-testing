/** Roles supported by the AUT (Prisma enum `Role`). */
export const Role = {
  ADMIN: 'ADMIN',
  CUSTOMER: 'CUSTOMER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Order lifecycle states supported by the AUT (Prisma enum `OrderStatus`). */
export const OrderStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/**
 * Documented transition table (application-under-test/src/orders/order-status.ts).
 * Used as the test oracle for state-machine tests.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const Endpoints = {
  register: 'auth/register',
  login: 'auth/login',
  me: 'users/me',
  users: 'users',
  products: 'products',
  product: (id: string) => `products/${encodeURIComponent(id)}`,
  orders: 'orders',
  order: (id: string) => `orders/${encodeURIComponent(id)}`,
  orderStatus: (id: string) => `orders/${encodeURIComponent(id)}/status`,
  openApiJson: 'docs-json',
} as const;

/** Pagination limits declared by the AUT's PaginationDto. */
export const Pagination = { DEFAULT_PAGE: 1, DEFAULT_LIMIT: 20, MAX_LIMIT: 100 } as const;

/** PostgreSQL INTEGER upper bound – columns priceCents/stock/totalCents are int4. */
export const PG_INT4_MAX = 2_147_483_647;

/** Prefix for every QA-generated product name so cleanup can target only test data. */
export const TEST_DATA_PREFIX = 'QA-';

/**
 * Tags used to slice the suite (`npm run test:<tag>`).
 * Playwright matches `--grep` against the title *and* the tags.
 */
export const Tag = {
  smoke: '@smoke',
  regression: '@regression',
  api: '@api',
  authentication: '@authentication',
  authorization: '@authorization',
  integration: '@integration',
  database: '@database',
  contract: '@contract',
  security: '@security',
  negative: '@negative',
  concurrency: '@concurrency',
  knownDefect: '@known-defect',
} as const;

/** Defect IDs documented in docs/bug-reports/ (verified against the running AUT). */
export const Defect = {
  DUPLICATE_LINE_ITEM_OVERSELL: 'BUG-001',
  CONCURRENT_OVERSELL: 'BUG-002',
  CANCEL_NO_RESTOCK: 'BUG-003',
  INT_OVERFLOW_500: 'BUG-004',
  INACTIVE_PRODUCT_VISIBLE: 'BUG-005',
  CONCURRENT_STATUS_RACE: 'BUG-006',
  CONTAINER_ENTRYPOINT: 'BUG-007',
  PAYLOAD_TOO_LARGE_500: 'BUG-008',
  NUL_BYTE_500: 'BUG-009',
  UNAUTHORIZED_ERROR_LABEL: 'BUG-010',
  STRING_FALSE_COERCED_TRUE: 'BUG-011',
  CONTENTION_TIMEOUT_PHANTOM: 'BUG-012',
  REGISTRATION_RACE_500: 'BUG-013',
} as const;

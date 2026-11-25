/**
 * JSON Schemas (draft 2020-12) describing the AUT's *current* response
 * contract, derived from its Prisma models, DTOs, services and the OpenAPI
 * document served at /api/docs-json.
 *
 * `additionalProperties: false` is deliberate: a new field in a response is a
 * contract change that should be reviewed (and could be an excessive-data-
 * exposure regression, e.g. `passwordHash`).
 */
import type { JSONSchemaType } from 'ajv';

type Schema = Record<string, unknown> & { $id: string };

/** Prisma `@default(cuid())` identifiers, e.g. `cmf3k2x9a0000xyz12345abcd`. */
export const CUID_PATTERN = '^c[a-z0-9]{24}$';

const id = { type: 'string', pattern: CUID_PATTERN } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const role = { type: 'string', enum: ['ADMIN', 'CUSTOMER'] } as const;
const orderStatus = {
  type: 'string',
  enum: ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
} as const;

export const authUserSchema: Schema = {
  $id: 'authUser',
  type: 'object',
  required: ['id', 'email', 'name', 'role'],
  additionalProperties: false,
  properties: {
    id,
    email: { type: 'string', format: 'email' },
    name: { type: 'string', minLength: 2 },
    role,
  },
};

export const authResponseSchema: Schema = {
  $id: 'authResponse',
  type: 'object',
  required: ['accessToken', 'user'],
  additionalProperties: false,
  properties: {
    accessToken: { type: 'string', pattern: '^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$' },
    user: { $ref: 'authUser' },
  },
};

export const userProfileSchema: Schema = {
  $id: 'userProfile',
  type: 'object',
  required: ['id', 'email', 'name', 'role', 'createdAt'],
  additionalProperties: false,
  properties: {
    id,
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    role,
    createdAt: timestamp,
  },
};

export const userListSchema: Schema = {
  $id: 'userList',
  type: 'array',
  items: { $ref: 'userProfile' },
};

export const productSchema: Schema = {
  $id: 'product',
  type: 'object',
  required: [
    'id',
    'name',
    'description',
    'priceCents',
    'stock',
    'isActive',
    'createdAt',
    'updatedAt',
  ],
  additionalProperties: false,
  properties: {
    id,
    name: { type: 'string', minLength: 2 },
    description: { type: ['string', 'null'] },
    priceCents: { type: 'integer', minimum: 1 },
    // A negative value would itself be an inventory-integrity violation.
    stock: { type: 'integer', minimum: 0 },
    isActive: { type: 'boolean' },
    createdAt: timestamp,
    updatedAt: timestamp,
  },
};

export const orderItemSchema: Schema = {
  $id: 'orderItem',
  type: 'object',
  required: ['id', 'orderId', 'productId', 'quantity', 'unitPriceCents', 'product'],
  additionalProperties: false,
  properties: {
    id,
    orderId: id,
    productId: id,
    quantity: { type: 'integer', minimum: 1 },
    unitPriceCents: { type: 'integer', minimum: 1 },
    // Nested product snapshot is the *current* product row, so stock may legitimately
    // differ from the moment of purchase; validated with the loose variant.
    product: { $ref: 'productLoose' },
  },
};

/** Product shape without business-range constraints (used when nested in orders). */
export const productLooseSchema: Schema = {
  ...productSchema,
  $id: 'productLoose',
  properties: {
    ...(productSchema.properties as object),
    stock: { type: 'integer' },
  },
};

export const orderSchema: Schema = {
  $id: 'order',
  type: 'object',
  required: ['id', 'userId', 'status', 'totalCents', 'createdAt', 'updatedAt', 'items'],
  additionalProperties: false,
  properties: {
    id,
    userId: id,
    status: orderStatus,
    totalCents: { type: 'integer', minimum: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
    items: { type: 'array', minItems: 1, items: { $ref: 'orderItem' } },
  },
};

const paginationMeta = {
  type: 'object',
  required: ['page', 'limit', 'total', 'totalPages'],
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
  },
} as const;

export const paginatedProductsSchema: Schema = {
  $id: 'paginatedProducts',
  type: 'object',
  required: ['data', 'meta'],
  additionalProperties: false,
  properties: { data: { type: 'array', items: { $ref: 'product' } }, meta: paginationMeta },
};

export const paginatedOrdersSchema: Schema = {
  $id: 'paginatedOrders',
  type: 'object',
  required: ['data', 'meta'],
  additionalProperties: false,
  properties: { data: { type: 'array', items: { $ref: 'order' } }, meta: paginationMeta },
};

export const errorSchema: Schema = {
  $id: 'error',
  type: 'object',
  required: ['statusCode', 'error', 'message', 'path', 'timestamp'],
  additionalProperties: false,
  properties: {
    statusCode: { type: 'integer', minimum: 400, maximum: 599 },
    error: { type: 'string', minLength: 1 },
    message: {
      oneOf: [
        { type: 'string', minLength: 1 },
        { type: 'array', minItems: 1, items: { type: 'string' } },
      ],
    },
    path: { type: 'string', pattern: '^/api/' },
    timestamp: timestamp,
  },
};

export const allSchemas: Schema[] = [
  authUserSchema,
  authResponseSchema,
  userProfileSchema,
  userListSchema,
  productSchema,
  productLooseSchema,
  orderItemSchema,
  orderSchema,
  paginatedProductsSchema,
  paginatedOrdersSchema,
  errorSchema,
];

export type SchemaId =
  | 'authUser'
  | 'authResponse'
  | 'userProfile'
  | 'userList'
  | 'product'
  | 'orderItem'
  | 'order'
  | 'paginatedProducts'
  | 'paginatedOrders'
  | 'error';

// Re-exported for consumers that want typed schemas.
export type { JSONSchemaType };

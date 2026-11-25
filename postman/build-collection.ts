/**
 * Source of truth for the Postman collection. Run `npm run postman:build` to
 * regenerate postman/collections/orderflow-api.postman_collection.json, which
 * is committed so it can be imported into Postman directly.
 *
 * Scope (by design): exploration, smoke and representative chained workflows –
 * not a duplicate of the Playwright suite.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
interface Req {
  name: string;
  method: Method;
  path: string;
  auth?: 'admin' | 'customer' | 'otherCustomer' | 'none';
  body?: string;
  prerequest?: string[];
  tests: string[];
  description?: string;
}

const lines = (s: string) =>
  s
    .trim()
    .split('\n')
    .map((l) => l.replace(/^ {4}/, ''));

const item = (r: Req) => ({
  name: r.name,
  event: [
    ...(r.prerequest
      ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: r.prerequest } }]
      : []),
    { listen: 'test', script: { type: 'text/javascript', exec: r.tests } },
  ],
  request: {
    method: r.method,
    description: r.description,
    header: [
      { key: 'Accept', value: 'application/json' },
      ...(r.body ? [{ key: 'Content-Type', value: 'application/json' }] : []),
    ],
    auth:
      r.auth && r.auth !== 'none'
        ? {
            type: 'bearer',
            bearer: [{ key: 'token', value: `{{${r.auth}Token}}`, type: 'string' }],
          }
        : { type: 'noauth' },
    ...(r.body
      ? { body: { mode: 'raw', raw: r.body, options: { raw: { language: 'json' } } } }
      : {}),
    url: {
      raw: `{{baseUrl}}/${r.path}`,
      host: ['{{baseUrl}}'],
      path: r.path.split('?')[0]!.split('/'),
      ...(r.path.includes('?')
        ? {
            query: r.path
              .split('?')[1]!
              .split('&')
              .map((kv) => ({ key: kv.split('=')[0], value: kv.split('=')[1] })),
          }
        : {}),
    },
  },
});

const errorEnvelope = lines(`
    pm.test('Error uses the standard envelope', () => {
      const body = pm.response.json();
      pm.expect(body).to.include.keys('statusCode', 'error', 'message', 'path', 'timestamp');
      pm.expect(body.statusCode).to.eql(pm.response.code);
    });
`);

const status = (code: number) => [
  `pm.test('Status is ${code}', () => pm.response.to.have.status(${code}));`,
];
const fast = [
  "pm.test('Responds within 1000 ms', () => pm.expect(pm.response.responseTime).to.be.below(1000));",
];

const productSchema = `{
      type: 'object',
      required: ['id', 'name', 'priceCents', 'stock', 'isActive', 'createdAt', 'updatedAt'],
      properties: {
        id: { type: 'string', pattern: '^c[a-z0-9]{24}$' },
        name: { type: 'string' },
        priceCents: { type: 'integer', minimum: 1 },
        stock: { type: 'integer', minimum: 0 },
        isActive: { type: 'boolean' }
      }
    }`;

const folders: { name: string; description: string; item: Req[] }[] = [
  {
    name: '1. Authentication',
    description: 'JWT issuance for the seeded admin and a dynamically registered customer.',
    item: [
      {
        name: 'Login as admin',
        method: 'POST',
        path: 'auth/login',
        body: '{\n  "email": "{{adminEmail}}",\n  "password": "{{adminPassword}}"\n}',
        tests: [
          ...status(201),
          ...fast,
          ...lines(`
    const body = pm.response.json();
    pm.test('Returns an ADMIN user and a JWT', () => {
      pm.expect(body.user.role).to.eql('ADMIN');
      pm.expect(body.accessToken.split('.')).to.have.lengthOf(3);
    });
    pm.test('No password material in the response', () => {
      pm.expect(pm.response.text()).to.not.match(/password/i);
    });
    pm.collectionVariables.set('adminToken', body.accessToken);
`),
        ],
      },
      {
        name: 'Register customer',
        method: 'POST',
        path: 'auth/register',
        prerequest: lines(`
    const unique = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    pm.collectionVariables.set('customerEmail', 'postman.' + unique + '@example.test');
    pm.collectionVariables.set('customerPassword', 'Pm!' + unique + 'Aa1');
`),
        body: '{\n  "email": "{{customerEmail}}",\n  "name": "Postman Customer",\n  "password": "{{customerPassword}}"\n}',
        tests: [
          ...status(201),
          ...lines(`
    const body = pm.response.json();
    pm.test('New account is a CUSTOMER', () => pm.expect(body.user.role).to.eql('CUSTOMER'));
    pm.test('Email normalised', () => pm.expect(body.user.email).to.eql(pm.collectionVariables.get('customerEmail').toLowerCase()));
    pm.collectionVariables.set('customerToken', body.accessToken);
    pm.collectionVariables.set('customerId', body.user.id);
`),
        ],
      },
      {
        name: 'Login as customer',
        method: 'POST',
        path: 'auth/login',
        body: '{\n  "email": "{{customerEmail}}",\n  "password": "{{customerPassword}}"\n}',
        tests: [
          ...status(201),
          ...lines(`
    const body = pm.response.json();
    pm.test('Token subject is the registered customer', () => {
      const payload = JSON.parse(atob(body.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      pm.expect(payload.sub).to.eql(pm.collectionVariables.get('customerId'));
      pm.expect(payload.role).to.eql('CUSTOMER');
      pm.expect(payload.exp).to.be.above(payload.iat);
    });
    pm.collectionVariables.set('customerToken', body.accessToken);
`),
        ],
      },
    ],
  },
  {
    name: '2. Customers',
    description: 'Profile and admin-only user directory.',
    item: [
      {
        name: 'Get my profile',
        method: 'GET',
        path: 'users/me',
        auth: 'customer',
        tests: [
          ...status(200),
          ...lines(`
    const body = pm.response.json();
    pm.test('Profile belongs to the token subject', () => pm.expect(body.id).to.eql(pm.collectionVariables.get('customerId')));
    pm.test('No password hash exposed', () => pm.expect(body).to.not.have.property('passwordHash'));
`),
        ],
      },
      {
        name: 'List users (admin)',
        method: 'GET',
        path: 'users',
        auth: 'admin',
        tests: [
          ...status(200),
          ...lines(`
    const users = pm.response.json();
    pm.test('Directory contains the new customer', () => pm.expect(users.map(u => u.id)).to.include(pm.collectionVariables.get('customerId')));
    pm.test('No user exposes a password hash', () => users.forEach(u => pm.expect(u).to.not.have.property('passwordHash')));
`),
        ],
      },
    ],
  },
  {
    name: '3. Products',
    description: 'Public catalog and admin product management.',
    item: [
      {
        name: 'List products (paginated)',
        method: 'GET',
        path: 'products?page=1&limit=5',
        tests: [
          ...status(200),
          ...fast,
          ...lines(`
    const body = pm.response.json();
    pm.test('Pagination meta is consistent', () => {
      pm.expect(body.meta.page).to.eql(1);
      pm.expect(body.meta.limit).to.eql(5);
      pm.expect(body.meta.totalPages).to.eql(Math.ceil(body.meta.total / body.meta.limit));
      pm.expect(body.data.length).to.be.at.most(5);
    });
    pm.test('Only active products are listed', () => body.data.forEach(p => pm.expect(p.isActive).to.be.true));
`),
        ],
      },
      {
        name: 'Create product (admin)',
        method: 'POST',
        path: 'products',
        auth: 'admin',
        prerequest: lines(`
    pm.collectionVariables.set('productName', 'QA-Postman ' + Date.now());
    pm.collectionVariables.set('productPrice', 1000 + Math.floor(Math.random() * 9000));
`),
        body: '{\n  "name": "{{productName}}",\n  "description": "Created by the Postman collection",\n  "priceCents": {{productPrice}},\n  "stock": 10\n}',
        tests: [
          ...status(201),
          ...lines(`
    const product = pm.response.json();
    pm.test('Product matches the JSON schema', () => pm.response.to.have.jsonSchema(${productSchema}));
    pm.test('Persisted values echo the request', () => {
      pm.expect(product.priceCents).to.eql(Number(pm.collectionVariables.get('productPrice')));
      pm.expect(product.stock).to.eql(10);
    });
    pm.collectionVariables.set('productId', product.id);
`),
        ],
      },
      {
        name: 'Get product by id',
        method: 'GET',
        path: 'products/{{productId}}',
        tests: [
          ...status(200),
          "pm.test('Correct product', () => pm.expect(pm.response.json().id).to.eql(pm.collectionVariables.get('productId')));",
        ],
      },
      {
        name: 'Update product price (admin, PATCH)',
        method: 'PATCH',
        path: 'products/{{productId}}',
        auth: 'admin',
        body: '{\n  "priceCents": 2500\n}',
        tests: [
          ...status(200),
          ...lines(`
    const product = pm.response.json();
    pm.test('Only the price changed', () => {
      pm.expect(product.priceCents).to.eql(2500);
      pm.expect(product.stock).to.eql(10);
    });
    pm.collectionVariables.set('productPrice', 2500);
`),
        ],
      },
    ],
  },
  {
    name: '4. Inventory',
    description: 'Inventory is the Product.stock field, managed by admins via PATCH /products/:id.',
    item: [
      {
        name: 'Set stock to 5 (admin)',
        method: 'PATCH',
        path: 'products/{{productId}}',
        auth: 'admin',
        body: '{\n  "stock": 5\n}',
        tests: [
          ...status(200),
          "pm.test('Stock updated', () => pm.expect(pm.response.json().stock).to.eql(5));",
        ],
      },
    ],
  },
  {
    name: '5. Orders',
    description: 'Customer order placement and retrieval.',
    item: [
      {
        name: 'Create order (customer)',
        method: 'POST',
        path: 'orders',
        auth: 'customer',
        body: '{\n  "items": [{ "productId": "{{productId}}", "quantity": 2 }]\n}',
        tests: [
          ...status(201),
          ...lines(`
    const order = pm.response.json();
    const price = Number(pm.collectionVariables.get('productPrice'));
    pm.test('Order starts PENDING and belongs to the customer', () => {
      pm.expect(order.status).to.eql('PENDING');
      pm.expect(order.userId).to.eql(pm.collectionVariables.get('customerId'));
    });
    pm.test('Total = unit price × quantity', () => {
      pm.expect(order.items[0].unitPriceCents).to.eql(price);
      pm.expect(order.totalCents).to.eql(price * 2);
    });
    pm.collectionVariables.set('orderId', order.id);
`),
        ],
      },
      {
        name: 'Get my order',
        method: 'GET',
        path: 'orders/{{orderId}}',
        auth: 'customer',
        tests: [
          ...status(200),
          "pm.test('Same order', () => pm.expect(pm.response.json().id).to.eql(pm.collectionVariables.get('orderId')));",
        ],
      },
      {
        name: 'List my orders',
        method: 'GET',
        path: 'orders',
        auth: 'customer',
        tests: [
          ...status(200),
          "pm.test('Only own orders', () => pm.response.json().data.forEach(o => pm.expect(o.userId).to.eql(pm.collectionVariables.get('customerId'))));",
        ],
      },
      {
        name: 'Verify stock was reserved',
        method: 'GET',
        path: 'products/{{productId}}',
        tests: [
          ...status(200),
          "pm.test('Stock decreased from 5 to 3', () => pm.expect(pm.response.json().stock).to.eql(3));",
        ],
      },
    ],
  },
  {
    name: '6. Integration workflow – fulfilment',
    description: 'Simulated payment → shipment → delivery, then catalog cleanup.',
    item: [
      ...(['PAID', 'SHIPPED', 'DELIVERED'] as const).map((s): Req => ({
        name: `Transition order to ${s} (admin)`,
        method: 'PATCH',
        path: 'orders/{{orderId}}/status',
        auth: 'admin',
        body: `{\n  "status": "${s}"\n}`,
        tests: [
          ...status(200),
          `pm.test('Order is ${s}', () => pm.expect(pm.response.json().status).to.eql('${s}'));`,
        ],
      })),
      {
        name: 'Delivered order is final (DELIVERED → CANCELLED rejected)',
        method: 'PATCH',
        path: 'orders/{{orderId}}/status',
        auth: 'admin',
        body: '{\n  "status": "CANCELLED"\n}',
        tests: [
          ...status(400),
          ...errorEnvelope,
          "pm.test('Explains the invalid transition', () => pm.expect(pm.response.json().message).to.include('Invalid status transition'));",
        ],
      },
      {
        name: 'Soft-delete product (admin)',
        method: 'DELETE',
        path: 'products/{{productId}}',
        auth: 'admin',
        tests: [
          ...status(200),
          "pm.test('Product deactivated', () => pm.expect(pm.response.json().isActive).to.be.false);",
        ],
      },
    ],
  },
  {
    name: '7. Negative scenarios',
    description: 'Representative error handling and access-control checks.',
    item: [
      {
        name: 'Login with wrong password → 401',
        method: 'POST',
        path: 'auth/login',
        body: '{\n  "email": "{{adminEmail}}",\n  "password": "definitely-wrong"\n}',
        tests: [...status(401), ...errorEnvelope],
      },
      {
        name: 'Create order without token → 401',
        method: 'POST',
        path: 'orders',
        auth: 'none',
        body: '{\n  "items": []\n}',
        tests: [...status(401), ...errorEnvelope],
      },
      {
        name: 'Customer creates product → 403',
        method: 'POST',
        path: 'products',
        auth: 'customer',
        body: '{\n  "name": "QA-Forbidden",\n  "priceCents": 100,\n  "stock": 1\n}',
        tests: [...status(403), ...errorEnvelope],
      },
      {
        name: 'Order zero quantity → 400',
        method: 'POST',
        path: 'orders',
        auth: 'customer',
        body: '{\n  "items": [{ "productId": "{{productId}}", "quantity": 0 }]\n}',
        tests: [
          ...status(400),
          ...errorEnvelope,
          "pm.test('Names the invalid field', () => pm.expect(JSON.stringify(pm.response.json().message)).to.include('quantity'));",
        ],
      },
      {
        name: 'Order inactive product → 400',
        method: 'POST',
        path: 'orders',
        auth: 'customer',
        body: '{\n  "items": [{ "productId": "{{productId}}", "quantity": 1 }]\n}',
        tests: [...status(400), ...errorEnvelope],
      },
      {
        name: 'Register second customer',
        method: 'POST',
        path: 'auth/register',
        prerequest: lines(`
    const unique = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    pm.collectionVariables.set('otherEmail', 'postman.other.' + unique + '@example.test');
`),
        body: '{\n  "email": "{{otherEmail}}",\n  "name": "Other Customer",\n  "password": "Other!Pass123"\n}',
        tests: [
          ...status(201),
          "pm.collectionVariables.set('otherCustomerToken', pm.response.json().accessToken);",
        ],
      },
      {
        name: "Read another customer's order → 403 (BOLA)",
        method: 'GET',
        path: 'orders/{{orderId}}',
        auth: 'otherCustomer',
        tests: [
          ...status(403),
          ...errorEnvelope,
          "pm.test('No order data leaked', () => pm.expect(pm.response.json()).to.not.have.property('items'));",
        ],
      },
      {
        name: 'Unknown product → 404',
        method: 'GET',
        path: 'products/cunknownunknownunknown0000',
        tests: [...status(404), ...errorEnvelope],
      },
    ],
  },
];

const collection = {
  info: {
    name: 'OrderFlow API – QA collection',
    description:
      'Exploration, smoke and representative workflows for the OrderFlow API (application under test). Run with `npm run test:postman` (Newman). Targets the LOCAL Docker environment only.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    'adminToken',
    'customerToken',
    'otherCustomerToken',
    'customerId',
    'customerEmail',
    'customerPassword',
    'otherEmail',
    'productId',
    'productName',
    'productPrice',
    'orderId',
  ].map((key) => ({ key, value: '' })),
  item: folders.map((f) => ({ name: f.name, description: f.description, item: f.item.map(item) })),
};

const out = path.join(__dirname, 'collections', 'orderflow-api.postman_collection.json');
writeFileSync(out, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Wrote ${out}`);

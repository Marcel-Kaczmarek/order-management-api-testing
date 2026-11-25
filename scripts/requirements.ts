/**
 * Business requirements baseline, derived from the AUT's README, DTOs and
 * services (application-under-test/). Entries marked `inferred` are not
 * stated by the AUT and need product-owner confirmation.
 *
 * `tests` lists test-ID prefixes (the first token of each test title).
 * scripts/traceability.ts verifies that every referenced test exists.
 */
export interface Requirement {
  id: string;
  feature: string;
  description: string;
  acceptance: string;
  source: string;
  tests: string[];
  inferred?: boolean;
}

export const REQUIREMENTS: Requirement[] = [
  {
    id: 'REQ-AUTH-01',
    feature: 'Registration',
    description: 'A visitor can register a customer account.',
    acceptance:
      'Valid input → 201 with JWT; role is always CUSTOMER; email unique (case-insensitive, normalised to lower case); DTO rules enforced (email format, name ≥ 2, password ≥ 8).',
    source: 'README "Register / login"; RegisterDto; AuthService.register',
    tests: [
      'REG-01',
      'REG-02',
      'REG-03',
      'REG-04',
      'REG-05',
      'REG-06',
      'REG-07',
      'CTR-01',
      'DB-01',
      'DB-11',
      'CON-08',
      'CON-09',
      'SMK-03',
    ],
  },
  {
    id: 'REQ-AUTH-02',
    feature: 'Login',
    description: 'A registered user can authenticate and receive a JWT.',
    acceptance:
      'Valid credentials → token with sub/email/role and 1-day expiry; invalid credentials → generic 401 that does not reveal whether the account exists; no password material returned.',
    source: 'README; LoginDto; AuthService.login',
    tests: [
      'AUTH-01',
      'AUTH-02',
      'AUTH-03',
      'AUTH-04',
      'AUTH-05',
      'AUTH-06',
      'AUTH-07',
      'SMK-02',
      'TYP-04',
    ],
  },
  {
    id: 'REQ-AUTH-03',
    feature: 'Token validation',
    description:
      'Protected endpoints accept only valid, unexpired, correctly signed bearer tokens.',
    acceptance:
      'Missing/expired/forged/tampered/unsigned/malformed tokens → 401 in the standard envelope without verification details.',
    source: 'JwtStrategy (ignoreExpiration: false); JwtAuthGuard',
    tests: [
      'TOK-01',
      'TOK-02',
      'TOK-03',
      'TOK-04',
      'TOK-05',
      'TOK-06',
      'TOK-07',
      'TOK-08',
      'TOK-09',
      'TOK-10',
      'RBAC-08',
      'BUG-010',
    ],
  },
  {
    id: 'REQ-AUTHZ-01',
    feature: 'Function-level authorization',
    description:
      'Only administrators may list users, manage products/inventory and change order status.',
    acceptance: 'CUSTOMER → 403 and no side effect; ADMIN → success.',
    source: '@Roles(Role.ADMIN); OrdersService.updateStatus',
    tests: [
      'RBAC-01',
      'RBAC-02',
      'RBAC-03',
      'RBAC-04',
      'RBAC-05',
      'RBAC-06',
      'RBAC-07',
      'RBAC-09',
      'SEC-11',
    ],
  },
  {
    id: 'REQ-AUTHZ-02',
    feature: 'Object-level authorization',
    description: 'Customers can only see their own orders; administrators can see all.',
    acceptance: 'Foreign order → 403 without data; list scoped to caller; admin reads any order.',
    source: 'OrdersService.findOne / findAll',
    tests: ['BOLA-01', 'BOLA-02', 'BOLA-03', 'BOLA-04', 'BOLA-05', 'BOLA-06', 'BOLA-07', 'SEC-02'],
  },
  {
    id: 'REQ-USR-01',
    feature: 'User profile & directory',
    description:
      'Users can read their profile; admins can list users; no sensitive fields are exposed.',
    acceptance: 'Profile = token subject; no passwordHash anywhere.',
    source: 'UsersService (select excludes passwordHash)',
    tests: ['SMK-03', 'BOLA-06', 'CTR-02', 'SEC-01'],
  },
  {
    id: 'REQ-PRD-01',
    feature: 'Product creation',
    description: 'Administrators create products with validated attributes.',
    acceptance:
      'Valid → 201 echoing input, isActive default true; name ≥ 2, priceCents ≥ 1, stock ≥ 0, integers; unknown/server-managed fields rejected; out-of-range values rejected with 400.',
    source: 'CreateProductDto; ValidationPipe(whitelist, forbidNonWhitelisted)',
    tests: [
      'PRD-01',
      'PRD-02',
      'PRD-11',
      'PRD-12',
      'PRD-14',
      'PRD-15',
      'TYP-01',
      'TYP-02',
      'TYP-03',
      'BUG-004',
      'BUG-011',
    ],
  },
  {
    id: 'REQ-PRD-02',
    feature: 'Catalog browsing',
    description: 'Anyone can browse the active catalog with pagination and read product details.',
    acceptance:
      'Defaults page=1/limit=20, max 100, newest first, only active products, meta consistent; unknown query params rejected; inactive products not publicly visible.',
    source: 'README "public/customer reads active catalog"; PaginationDto; ProductsService.findAll',
    tests: [
      'PRD-03',
      'PRD-09',
      'PRD-10',
      'LST-01',
      'LST-02',
      'LST-03',
      'LST-04',
      'LST-05',
      'LST-06',
      'LST-07',
      'LST-08',
      'LST-09',
      'SMK-01',
      'BUG-005',
      'BUG-009',
    ],
  },
  {
    id: 'REQ-PRD-03',
    feature: 'Product maintenance',
    description: 'Administrators update products partially and soft-delete them.',
    acceptance:
      'PATCH changes only supplied fields and advances updatedAt; DELETE sets isActive=false, keeps history, is idempotent; product can be re-activated.',
    source: 'ProductsService.update / remove',
    tests: ['PRD-04', 'PRD-05', 'PRD-06', 'PRD-07', 'PRD-08', 'PRD-13', 'DB-09', 'DB-10', 'TYP-05'],
  },
  {
    id: 'REQ-INV-01',
    feature: 'Inventory management',
    description: 'Administrators set stock levels; changes are immediately effective for ordering.',
    acceptance:
      'Stock update persisted and honoured by the next order; concurrent updates never corrupt the value.',
    source: 'Product.stock; PATCH /products/:id',
    tests: ['RBAC-05', 'INT-02', 'CON-02'],
  },
  {
    id: 'REQ-ORD-01',
    feature: 'Order validation',
    description:
      'Orders may only contain existing, active products with positive integer quantities.',
    acceptance: 'Invalid products/payloads → 400 and no data written.',
    source: 'CreateOrderDto; OrdersService.create',
    tests: ['ORD-07', 'ORD-08', 'ORD-10', 'ORD-12', 'SEC-08', 'BUG-008'],
  },
  {
    id: 'REQ-ORD-02',
    feature: 'Stock availability',
    description:
      'An order is accepted only if enough stock is available; stock never becomes negative.',
    acceptance:
      'Quantity ≤ stock accepted (boundary = stock); stock+1 rejected; holds for repeated lines and under concurrency.',
    source: 'OrdersService.create (Insufficient stock)',
    tests: ['ORD-04', 'ORD-05', 'ORD-06', 'ORD-09', 'ORD-14', 'CON-01', 'CON-04', 'BUG-001'],
  },
  {
    id: 'REQ-ORD-03',
    feature: 'Pricing & totals',
    description: 'Prices come from the catalog at checkout; total = Σ(quantity × unit price).',
    acceptance:
      'Client cannot supply prices/totals; later price changes do not alter existing orders.',
    source: 'OrdersService.create (totalCents, unitPriceCents)',
    tests: ['ORD-01', 'ORD-02', 'ORD-11', 'ORD-13', 'ORD-15', 'SMK-04', 'DB-03'],
  },
  {
    id: 'REQ-ORD-04',
    feature: 'Atomic order placement',
    description: 'Stock decrement and order creation succeed or fail together.',
    acceptance: 'Failures leave no partial data; acknowledged orders = persisted orders.',
    source: 'OrdersService.create ($transaction)',
    tests: ['ORD-03', 'INT-06', 'INT-07', 'CON-07', 'CON-11'],
  },
  {
    id: 'REQ-ORD-05',
    feature: 'Order retrieval & history',
    description: 'Customers list their orders (newest first, paginated) and read order details.',
    acceptance: 'Detail, list and DB agree; pagination meta exact for the customer.',
    source: 'OrdersService.findAll / findOne',
    tests: ['INT-04', 'INT-05', 'CTR-04'],
  },
  {
    id: 'REQ-LC-01',
    feature: 'Order state machine',
    description:
      'Status follows PENDING → PAID → SHIPPED → DELIVERED, or CANCELLED from PENDING/PAID; DELIVERED and CANCELLED are final.',
    acceptance:
      'Allowed transitions → 200; every other transition → 400 with no change to the record.',
    source: 'order-status.ts ALLOWED_TRANSITIONS',
    tests: ['LC-01', 'LC-02', 'LC-03', 'LC-06', 'LC-07', 'INT-01'],
  },
  {
    id: 'REQ-LC-02',
    feature: 'No duplicate payment / fulfilment',
    description: 'A payment confirmation or shipment is applied at most once.',
    acceptance: 'Repeated transition → 400 sequentially and under concurrency exactly one success.',
    source: 'assertTransition ("Order is already …")',
    tests: ['LC-04', 'LC-05', 'CON-05', 'CON-06', 'CON-10'],
  },
  {
    id: 'REQ-LC-03',
    feature: 'Cancellation & inventory restoration',
    description: 'Cancelling an order releases its reserved stock and preserves the order record.',
    acceptance: 'After cancellation stock is restored; order items and totals remain for audit.',
    source: 'Inferred – AUT is silent on restocking',
    inferred: true,
    tests: ['LC-02', 'INT-08', 'BUG-003'],
  },
  {
    id: 'REQ-DATA-01',
    feature: 'Persistence fidelity',
    description: 'Data returned by the API equals what is stored in PostgreSQL.',
    acceptance: 'Values, relationships and timestamps (UTC) match; updatedAt advances on change.',
    source: 'Prisma schema',
    tests: ['DB-02', 'DB-03', 'DB-04', 'DB-10', 'INT-01', 'INT-03', 'INT-04'],
  },
  {
    id: 'REQ-DATA-02',
    feature: 'Data integrity constraints',
    description: 'The schema enforces uniqueness, referential integrity and mandatory fields.',
    acceptance:
      'Unique email index, three FKs, NOT NULL columns, no orphans; QA role cannot write.',
    source: 'prisma/migrations/20260810120000_init',
    tests: ['DB-05', 'DB-06', 'DB-07', 'DB-08', 'DB-12', 'SEC-04'],
  },
  {
    id: 'REQ-API-01',
    feature: 'API contract & error handling',
    description:
      'Responses follow a stable schema and a uniform error envelope with correct status codes.',
    acceptance:
      'Schemas validated for all endpoints; OpenAPI declares all operations; client errors are 4xx, never 5xx.',
    source: 'HttpExceptionFilter; Swagger document',
    tests: [
      'CTR-03',
      'CTR-05',
      'CTR-06',
      'CTR-07',
      'CTR-08',
      'OAS-01',
      'OAS-02',
      'OAS-03',
      'OAS-04',
      'OAS-05',
      'SMK-05',
      'NEG-01',
      'NEG-02',
      'NEG-03',
      'NEG-04',
      'NEG-05',
      'NEG-06',
      'NEG-07',
      'NEG-08',
    ],
  },
  {
    id: 'REQ-NFR-01',
    feature: 'Security hardening',
    description: 'The API resists common OWASP API Top 10 attack patterns.',
    acceptance:
      'Injection handled as data, no internals in errors, bounded resource use, no CORS wildcard, no fingerprinting.',
    source: 'OWASP API Security Top 10 (2023)',
    inferred: true,
    tests: ['SEC-03', 'SEC-05', 'SEC-06', 'SEC-07', 'SEC-09', 'SEC-10', 'SEC-12'],
  },
  {
    id: 'REQ-NFR-02',
    feature: 'Concurrency safety',
    description: 'Business invariants hold under concurrent requests.',
    acceptance: 'No lost updates, no duplicates beyond design, no contradictory acknowledgements.',
    source: 'Inferred – standard transactional expectations',
    inferred: true,
    tests: [
      'CON-01',
      'CON-02',
      'CON-03',
      'CON-04',
      'CON-05',
      'CON-06',
      'CON-07',
      'CON-08',
      'CON-09',
      'CON-10',
      'CON-11',
    ],
  },
];

/** Requirements verified outside Playwright (listed in the RTM with their evidence). */
export const NON_PLAYWRIGHT_REQUIREMENTS = [
  {
    id: 'REQ-NFR-03',
    feature: 'Performance',
    description:
      'Read endpoints p95 < 500 ms, write endpoints p95 < 1000 ms, error rate < 1 % (proposed portfolio criteria, local Docker).',
    evidence: 'performance/{smoke,load,stress,spike}.js – see docs/test-execution-summary.md',
  },
  {
    id: 'REQ-NFR-04',
    feature: 'Deployability',
    description: 'The documented `docker compose up --build` starts the service.',
    evidence: 'BUG-007 – upstream image fails to start; verified while building the environment',
  },
];

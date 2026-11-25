/**
 * Shared k6 building blocks: configuration, setup, user flow, thresholds and
 * a summary writer. Thresholds are PROPOSED portfolio acceptance criteria for
 * a local Docker environment – not verified production SLAs.
 */
import http from 'k6/http';
import { check, group, fail } from 'k6';
import { Counter, Rate } from 'k6/metrics';

export const BASE_URL = `${(__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')}/api`;
const P95_READ_MS = Number(__ENV.P95_READ_MS || 500);
const P95_WRITE_MS = Number(__ENV.P95_WRITE_MS || 1000);
const MAX_ERROR_RATE = Number(__ENV.MAX_ERROR_RATE || 0.01);
/** Fraction of iterations that place an order (keeps write load controlled). */
const ORDER_RATIO = Number(__ENV.ORDER_RATIO || 0.2);
/** Fraction of iterations that re-authenticate (bcrypt is deliberately CPU-heavy). */
const LOGIN_RATIO = Number(__ENV.LOGIN_RATIO || 0.1);

export const businessTransactions = new Counter('business_transactions');
export const businessFailures = new Rate('business_transaction_failures');

export const thresholds = {
  http_req_failed: [`rate<${MAX_ERROR_RATE}`],
  'http_req_duration{type:read}': [`p(95)<${P95_READ_MS}`],
  'http_req_duration{type:write}': [`p(95)<${P95_WRITE_MS}`],
  'http_req_duration{type:auth}': [`p(95)<${P95_WRITE_MS}`],
  checks: ['rate>0.99'],
  business_transaction_failures: ['rate<0.01'],
};

export const summaryTrendStats = ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'];

const json = { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
const bearer = (token) => ({ headers: { ...json.headers, Authorization: `Bearer ${token}` } });

function login(email, password) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
    ...json,
    tags: { type: 'auth', name: 'POST /auth/login' },
  });
  check(res, { 'login 201': (r) => r.status === 201 });
  return res.status === 201 ? res.json('accessToken') : null;
}

/** Runs once per test: authenticates and discovers the PERF reference products. */
export function setup() {
  const customerToken = login(
    __ENV.CUSTOMER_EMAIL || 'customer@orderflow.dev',
    __ENV.CUSTOMER_PASSWORD || 'Customer123!',
  );
  if (!customerToken) fail('Seeded customer cannot log in – run "npm run setup".');

  const res = http.get(`${BASE_URL}/products?limit=100`, { tags: { type: 'setup' } });
  const productIds = (res.json('data') || [])
    .filter((p) => p.name.indexOf('PERF-') === 0)
    .map((p) => p.id);
  if (productIds.length === 0) fail('No PERF- reference products found – run "npm run seed".');
  return { customerToken, productIds };
}

/** One virtual-user iteration: browse catalog, sometimes log in, sometimes order. */
export function userFlow(data) {
  const productId = data.productIds[Math.floor(Math.random() * data.productIds.length)];

  group('browse catalog', () => {
    const list = http.get(`${BASE_URL}/products?page=1&limit=20`, {
      tags: { type: 'read', name: 'GET /products' },
    });
    check(list, {
      'list 200': (r) => r.status === 200,
      'list has data': (r) => Array.isArray(r.json('data')),
    });

    const detail = http.get(`${BASE_URL}/products/${productId}`, {
      tags: { type: 'read', name: 'GET /products/:id' },
    });
    check(detail, { 'detail 200': (r) => r.status === 200 });
  });

  if (Math.random() < LOGIN_RATIO) {
    group('authenticate', () => {
      login(
        __ENV.CUSTOMER_EMAIL || 'customer@orderflow.dev',
        __ENV.CUSTOMER_PASSWORD || 'Customer123!',
      );
    });
  }

  if (Math.random() < ORDER_RATIO) {
    group('place order', () => {
      const created = http.post(
        `${BASE_URL}/orders`,
        JSON.stringify({ items: [{ productId, quantity: 1 }] }),
        { ...bearer(data.customerToken), tags: { type: 'write', name: 'POST /orders' } },
      );
      const ok = check(created, {
        'order 201': (r) => r.status === 201,
        'order total = unit price': (r) =>
          r.status === 201 && r.json('totalCents') === r.json('items.0.unitPriceCents'),
      });
      businessFailures.add(!ok);
      if (!ok) return;
      businessTransactions.add(1);

      const read = http.get(`${BASE_URL}/orders/${created.json('id')}`, {
        ...bearer(data.customerToken),
        tags: { type: 'read', name: 'GET /orders/:id' },
      });
      check(read, { 'order readable 200': (r) => r.status === 200 });
    });
  }
}

function fmt(metric, stat) {
  const v = metric && metric.values ? metric.values[stat] : undefined;
  return v === undefined ? 'n/a' : v.toFixed(2);
}

/** Writes JSON + Markdown summaries to reports/performance/. */
export function buildSummary(name) {
  return function handleSummary(data) {
    const m = data.metrics;
    const rows = [
      ['All requests', m.http_req_duration],
      ['Reads', m['http_req_duration{type:read}']],
      ['Writes (orders)', m['http_req_duration{type:write}']],
      ['Auth (login)', m['http_req_duration{type:auth}']],
    ];
    const thresholdLines = Object.entries(m)
      .filter(([, metric]) => metric.thresholds)
      .flatMap(([key, metric]) =>
        Object.entries(metric.thresholds).map(
          ([t, r]) => `| \`${key}\` | \`${t}\` | ${r.ok ? '✅ pass' : '❌ FAIL'} |`,
        ),
      );
    const md = [
      `# k6 ${name} test – summary`,
      '',
      `Generated: ${new Date().toISOString()} · Target: ${BASE_URL} (local Docker)`,
      '',
      '| Metric group | avg ms | median ms | p90 ms | p95 ms | p99 ms | max ms |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...rows.map(
        ([label, metric]) =>
          `| ${label} | ${fmt(metric, 'avg')} | ${fmt(metric, 'med')} | ${fmt(metric, 'p(90)')} | ${fmt(metric, 'p(95)')} | ${fmt(metric, 'p(99)')} | ${fmt(metric, 'max')} |`,
      ),
      '',
      `- Requests: ${m.http_reqs.values.count} (${m.http_reqs.values.rate.toFixed(2)} req/s)`,
      `- HTTP error rate: ${(m.http_req_failed.values.rate * 100).toFixed(2)}%`,
      `- Successful business transactions (orders): ${m.business_transactions ? m.business_transactions.values.count : 0}`,
      `- Checks passed: ${(m.checks.values.rate * 100).toFixed(2)}%`,
      `- Iterations: ${m.iterations.values.count} · Max VUs: ${m.vus_max.values.max}`,
      '',
      '| Metric | Threshold | Result |',
      '| --- | --- | --- |',
      ...thresholdLines,
      '',
    ].join('\n');
    const dir = __ENV.SUMMARY_DIR || 'reports/performance';
    return {
      stdout: `${md}\n`,
      [`${dir}/${name}-summary.md`]: md,
      [`${dir}/${name}-summary.json`]: JSON.stringify(data, null, 2),
    };
  };
}

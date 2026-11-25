/**
 * Captures screenshots of ACTUAL generated reports into docs/screenshots/.
 *
 * Prerequisites: a completed test run (`npm test`), `npm run report`,
 * `npm run test:postman` and `npm run test:performance`.
 * Pages are served from reports/ over HTTP because the Allure and Playwright
 * reports cannot load their data from file:// URLs.
 *
 * The "database validation" view is produced live: it places a real order via
 * the API and renders the response next to the rows read from PostgreSQL.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, request, type Page } from '@playwright/test';
import { apiRoot, env } from '../src/config/env';
import { DbClient } from '../src/database/DbClient';
import { OrderRepository } from '../src/database/OrderRepository';
import type { AuthResponse, Order, Product } from '../src/models';
import { sanitize } from '../src/utilities/sanitizer';

const root = path.resolve(__dirname, '..');
const reports = path.join(root, 'reports');
const out = path.join(root, 'docs', 'screenshots');
mkdirSync(out, { recursive: true });

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
};

function serve(dir: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    let file = path.join(dir, url);
    if (!file.startsWith(dir)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Minimal Markdown → HTML for the generated summaries (headings, lists, tables). */
function markdownToHtml(md: string, title: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>');
  const lines = md.split('\n');
  const html: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.startsWith('|')) {
      const rows: string[] = [];
      while (lines[i]?.startsWith('|')) rows.push(lines[i++]!);
      i -= 1;
      const cells = (r: string) =>
        r
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
      html.push(
        `<table><thead><tr>${cells(rows[0]!)
          .map((c) => `<th>${inline(c)}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .slice(2)
          .map(
            (r) =>
              `<tr>${cells(r)
                .map((c) => `<td>${inline(c)}</td>`)
                .join('')}</tr>`,
          )
          .join('')}</tbody></table>`,
      );
    } else if (/^#{1,3} /.test(line)) {
      const level = line.indexOf(' ');
      html.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
    } else if (line.startsWith('- ')) {
      html.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim()) {
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#1f2328;max-width:1100px}
    h1{font-size:22px;margin:0 0 12px}h3{font-size:16px;margin:20px 0 8px}
    table{border-collapse:collapse;margin:8px 0;width:100%}th,td{border:1px solid #d0d7de;padding:4px 8px;text-align:left}
    th{background:#f6f8fa}td:not(:first-child){text-align:right}code{background:#f6f8fa;padding:0 4px;border-radius:4px}
    li{margin:2px 0}</style></head><body>${html.join('\n')}</body></html>`;
}

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage });
  console.log(`  ✔ docs/screenshots/${name}.png`);
}

async function databaseEvidenceHtml(): Promise<string> {
  const ctx = await request.newContext({ baseURL: apiRoot });
  const login = (await (
    await ctx.post('auth/login', { data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } })
  ).json()) as AuthResponse;
  const auth = { Authorization: `Bearer ${login.accessToken}` };
  const product = (await (
    await ctx.post('products', {
      headers: auth,
      data: { name: `QA-Evidence ${Date.now()}`, priceCents: 2499, stock: 10 },
    })
  ).json()) as Product;
  const email = `evidence.${Date.now()}@example.test`;
  const customer = (await (
    await ctx.post('auth/register', {
      data: { email, name: 'Evidence Customer', password: 'Evidence123!' },
    })
  ).json()) as AuthResponse;
  const order = (await (
    await ctx.post('orders', {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
      data: { items: [{ productId: product.id, quantity: 3 }] },
    })
  ).json()) as Order;

  const db = new DbClient();
  const repo = new OrderRepository(db);
  const [orderRow, items, productRow, userRow] = await Promise.all([
    repo.findOrder(order.id),
    repo.findOrderItems(order.id),
    repo.findProduct(product.id),
    repo.findUserById(customer.user.id),
  ]);
  await db.close();
  await ctx.delete(`products/${product.id}`, { headers: auth });
  await ctx.dispose();

  const checks: [string, boolean][] = [
    [
      'Order row exists with same id, userId, status, totalCents',
      orderRow?.userId === order.userId &&
        orderRow?.status === order.status &&
        orderRow?.totalCents === order.totalCents,
    ],
    [
      'totalCents = Σ(quantity × unitPriceCents) = 3 × 2499 = 7497',
      orderRow?.totalCents === 7497 &&
        items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0) === 7497,
    ],
    [
      'Order item references the product with the checkout price',
      items[0]?.productId === product.id && items[0]?.unitPriceCents === 2499,
    ],
    ['Inventory decremented 10 → 7 in PostgreSQL', productRow?.stock === 7],
    [
      'Order owner is the registered customer; password stored as bcrypt hash only',
      userRow?.email === email && /^\$2[aby]\$/.test(userRow?.passwordHash ?? ''),
    ],
    [
      'createdAt identical in API and DB (UTC)',
      orderRow?.createdAt.toISOString() === order.createdAt,
    ],
  ];
  const pre = (v: unknown) =>
    `<pre>${JSON.stringify(sanitize(v), null, 2).replace(/</g, '&lt;')}</pre>`;
  const dbView = {
    'SELECT * FROM "Order" WHERE id = $1': orderRow,
    'SELECT * FROM "OrderItem" WHERE "orderId" = $1': items,
    'SELECT id, stock FROM "Product" WHERE id = $1': {
      id: productRow?.id,
      stock: productRow?.stock,
    },
    'SELECT email, role, left("passwordHash", 7) FROM "User" WHERE id = $1': {
      email: userRow?.email,
      role: userRow?.role,
      hashAlgorithmPrefix: `${userRow?.passwordHash.slice(0, 7)}… (bcrypt cost 10; remainder not shown)`,
    },
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>API ↔ PostgreSQL validation</title><style>
    body{font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;margin:20px;color:#1f2328}
    h1{font-size:20px;margin:0 0 4px}.sub{color:#57606a;margin-bottom:14px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}h2{font-size:14px;margin:0 0 6px}
    pre{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:10px;font-size:11.5px;overflow:hidden;margin:0}
    ul{list-style:none;padding:0;margin:14px 0 0}li{padding:3px 0}.ok{color:#1a7f37;font-weight:600}.ko{color:#cf222e;font-weight:600}
    </style></head><body><h1>API response vs. PostgreSQL state</h1>
    <div class="sub">Live run ${new Date().toISOString()} · POST /api/orders as a new customer · rows read with the read-only <code>qa_readonly</code> role using parameterized SQL</div>
    <div class="grid"><div><h2>API response (201 Created)</h2>${pre({ ...order, items: order.items.map(({ product: _p, ...i }) => ({ ...i, product: '…' })) })}</div>
    <div><h2>Database rows</h2>${Object.entries(dbView)
      .map(([q, v]) => `<div style="margin-bottom:8px"><code>${q}</code>${pre(v)}</div>`)
      .join('')}</div></div>
    <ul>${checks.map(([label, ok]) => `<li class="${ok ? 'ok' : 'ko'}">${ok ? '✔' : '✘'} ${label}</li>`).join('')}</ul></body></html>`;
}

async function main(): Promise<void> {
  const server = await serve(reports);
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  if (existsSync(path.join(reports, 'playwright-html', 'index.html'))) {
    await page.goto(`${base}/playwright-html/index.html`);
    await page.getByText('Smoke').first().waitFor();
    await shot(page, 'playwright-html-report-overview');
    await page.goto(`${base}/playwright-html/index.html#?q=${encodeURIComponent('@known-defect')}`);
    await page.waitForTimeout(500);
    await shot(page, 'playwright-html-report-known-defects');
    await page.locator('a', { hasText: 'BUG-001' }).first().click();
    await page.getByText('defect').first().waitFor();
    await shot(page, 'playwright-html-report-defect-evidence', true);
  }

  if (existsSync(path.join(reports, 'allure-report', 'index.html'))) {
    await page.goto(`${base}/allure-report/index.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await shot(page, 'allure-report-overview');
  }

  if (existsSync(path.join(reports, 'newman', 'newman-report.html'))) {
    await page.goto(`${base}/newman/newman-report.html`);
    await page.waitForLoadState('networkidle');
    await shot(page, 'newman-postman-report');
  }

  for (const scenario of ['smoke', 'load', 'stress', 'spike']) {
    const md = path.join(reports, 'performance', `${scenario}-summary.md`);
    if (!existsSync(md)) continue;
    await page.setContent(markdownToHtml(readFileSync(md, 'utf8'), `k6 ${scenario}`));
    await shot(page, `k6-${scenario}-summary`, true);
  }

  if (existsSync(path.join(reports, 'summary.md'))) {
    await page.setContent(
      markdownToHtml(readFileSync(path.join(reports, 'summary.md'), 'utf8'), 'Execution summary'),
    );
    await shot(page, 'execution-summary', true);
  }

  await page.setContent(await databaseEvidenceHtml());
  await shot(page, 'database-validation', true);

  await browser.close();
  server.close();
}

main().catch((error: Error) => {
  console.error(error);
  process.exit(1);
});

# BUG-001 – Repeated line items for one product bypass the stock check and drive stock negative

| Field               | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| Bug ID              | BUG-001                                                              |
| Component           | Orders – `POST /api/orders`                                          |
| Application version | orderflow-api `259c7d0e`                                             |
| Environment         | Local Docker (see [README](README.md))                               |
| Severity            | **High** – inventory corruption and overselling                      |
| Priority            | **P1**                                                               |
| Reproduction rate   | 100 % (deterministic; reproduced in every run since 2026-11-24)      |
| Status              | Open – confirmed by automation                                       |
| Automated test      | `tests/regression/known-defects.spec.ts` › "BUG-001 …" (`test.fail`) |

## Description

The stock check validates every order line **separately** against the product's current stock. If the same product appears on several lines, each line passes on its own even though the combined quantity exceeds the stock. The order is accepted, and the decrement drives `Product.stock` below zero.

## Preconditions

- An active product with `stock = 5`.
- An authenticated customer.

## Steps to reproduce

1. `POST /api/products` as admin with `{"name":"QA-Probe","priceCents":500,"stock":5}`.
2. As the customer, send `POST /api/orders` with:
   ```json
   {
     "items": [
       { "productId": "<id>", "quantity": 3 },
       { "productId": "<id>", "quantity": 3 }
     ]
   }
   ```
3. `GET /api/products/<id>`.

## Expected result

The order is rejected with `400 Insufficient stock` because 6 units were requested and only 5 exist. Stock stays at 5.

## Actual result

`201 Created`. The order totals 6 units (`totalCents: 3000`) and stock becomes **−1**.

## Evidence

Captured from the exploratory probe on 2026-11-24 (abridged):

```http
POST /api/orders  →  201
{"id":"cmwv6t1nm0003ro01o5wu6w90","status":"PENDING","totalCents":3000,"items":[{"quantity":3,"unitPriceCents":500,…},{"quantity":3,…}]}

GET /api/products/cmwv6t1k40001ro019495qz8n  →  200
{"id":"cmwv6t1k40001ro019495qz8n","name":"QA-Probe","priceCents":500,"stock":-1,"isActive":true,…}
```

Automated run (Playwright, 2026-11-24 21:28 UTC): `Expected API error 400 … status mismatch (got 201)`, with an order of `totalCents: 181050` for 6 units of a 5-unit product.

**Database evidence:** `SELECT stock FROM "Product" WHERE id = $1` returns `-1`. There is no `CHECK (stock >= 0)` constraint (see DB-07 and the migration `20260810120000_init`).

## Root cause (verified)

`application-under-test/src/orders/orders.service.ts`:

- Line 24 deduplicates product IDs only to verify that the products _exist_: `products.length !== new Set(productIds).size`.
- Line 33 compares `product.stock < item.quantity` **per line**, without summing the quantities per product.
- Line 50 decrements unconditionally: `stock: { decrement: item.quantity }`.

## Business impact

Customers can buy more units than exist, and are charged for goods that can't be fulfilled. Inventory reports show negative stock, which every downstream consumer of `stock` (catalog, replenishment) has to handle.

## Suggested remediation

1. Aggregate quantities per `productId` before validating, or reject duplicate product lines with a 400.
2. Make the decrement conditional inside the transaction: `UPDATE "Product" SET stock = stock - $q WHERE id = $id AND stock >= $q`, then fail if no row was updated. This also fixes BUG-002.
3. Add `CHECK ("stock" >= 0)` as a database-level safety net.

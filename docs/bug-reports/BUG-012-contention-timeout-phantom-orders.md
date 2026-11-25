# BUG-012 – Checkout under contention times out with 500 after ~5 s, and a "failed" order can still be committed

| Field               | Value                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bug ID              | BUG-012                                                                                                                                                                                             |
| Component           | Orders – `POST /api/orders` (interactive Prisma transaction)                                                                                                                                        |
| Application version | orderflow-api `259c7d0e`                                                                                                                                                                            |
| Severity            | **High** – a customer is told checkout failed, yet the order exists and the stock was consumed                                                                                                      |
| Priority            | **P1**                                                                                                                                                                                              |
| Reproduction rate   | **Host-dependent.** It needs enough row-lock queueing to exceed 5 s (see below).                                                                                                                    |
| Status              | Open – confirmed by automation on the reference host                                                                                                                                                |
| Automated test      | `tests/concurrency/order-concurrency.spec.ts` › CON-11. This is a bounded reproduction: up to 3 bursts of 16 buyers. The test is skipped with a reason when the timeout precondition isn't reached. |

## Description

All orders for one product serialize on that product's row lock inside an interactive transaction. When the queue exceeds Prisma's default interactive-transaction timeout of **5,000 ms**, the waiting requests fail with `500 Internal Server Error`. In the observed bursts, **more orders were persisted than were acknowledged with `201`**: some clients received 500 for checkouts that were committed.

## Steps to reproduce

1. Create a product with `stock: 1000` and register 16 customers.
2. Fire 16 concurrent `POST /api/orders` requests (`quantity: 1`) for that product.
3. Compare the number of 201 responses with `SELECT COUNT(*) FROM "OrderItem" WHERE "productId" = $1`.

## Expected result

Every request returns 201, or a deliberate 4xx/503. The persisted orders equal the acknowledged orders.

## Actual result

**Session 1:** 16 buyers × 6 rounds, during heavy load from other workloads on the shared host. This was the first observation, made with a prototype of the harness that used the same logic and the same read-only SQL:

| Round | 201 | 500 (latency of each 500) | Orders persisted | Stock decrement |
| ----- | --- | ------------------------- | ---------------- | --------------- |
| 1     | 6   | 10 (5,305–5,314 ms)       | **7**            | 7               |
| 2     | 8   | 8 (5,068–5,070 ms)        | **9**            | 9               |
| 3     | 16  | 0                         | 16               | 16              |
| 4     | 12  | 4 (5,351–5,352 ms)        | **13**           | 13              |
| 5     | 7   | 9 (5,149–5,152 ms)        | **8**            | 8               |
| 6     | 3   | 13 (5,152–5,156 ms)       | **4**            | 4               |

**Session 2:** the committed harness `npm run repro:contention -- 16 1000 6`, later the same day, with a lighter host load. **Not reproduced:** 6/6 rounds gave 16 × 201 with persisted = 16, and the maximum latency was 2.2 s.

**Session 3:** `npm run repro:contention -- 40 1000 4`, at higher contention:

| Round | 201 | 500 (latency range) | Orders persisted | Phantom orders |
| ----- | --- | ------------------- | ---------------- | -------------- |
| 1     | 10  | 30 (2,346–6,916 ms) | 11               | **1**          |
| 2     | 7   | 33 (2,035–8,876 ms) | 10               | **3**          |
| 3     | 8   | 32 (2,037–8,617 ms) | 10               | **2**          |

Round 4 aborted with a client-side `ECONNRESET` on one request. The API container did not restart, and nothing was logged, so this isn't claimed as a separate defect. The harness now counts transport errors instead of aborting.

- In session 1 the 500s cluster just above **5,000 ms**, matching the interactive-transaction `timeout`. In session 3 a second cluster from about **2,000 ms** appears, matching `maxWait`, which is the time allowed to _acquire_ a transaction when the connection pool is exhausted.
- Every round with timeouts persisted **more orders than were acknowledged** (1–3 phantom orders).
- Playwright CON-11 (`--repeat-each=5`) reached the timeout in 2 of 5 runs. One of those runs persisted a phantom order (`accepted 5, 500 × 11, persisted 6`); the other did not (`6/6`). Neither PostgreSQL nor the API logs a deadlock.
- Contention is not even required to be high: during a full-suite run (4 parallel workers on a loaded host), only **5** concurrent orders for one product produced `[201, 500, 500, 500, 500]` (CON-01, 2026-11-24 21:40 UTC, test duration 15 s). CON-01 now asserts only invariants that hold regardless of timeouts.
- The k6 load profile (20 VUs) also shows the symptom: 5.75 % of orders failed (154 of 2,676), with a write p95 of 5,184 ms and a maximum of 23.7 s.

## Root cause

- **Verified:** `orders.service.ts` line 46 runs `this.prisma.$transaction(async (tx) => …)` with default options (`timeout: 5000`, `maxWait: 2000`). Each transaction holds the product row lock from its first `UPDATE` until commit, so contention serializes the requests. The AUT does not map the resulting Prisma error, so the filter returns a generic 500.
- **Not verified:** why some timed-out transactions still commit. A plausible explanation is a race between the client-side timeout and the commit of the transaction holding the lock. That needs Prisma query logging, which would require modifying the AUT.
- The API **does not log** these errors at all (the filter swallows them), which is an observability gap in itself.

## Why the rate is host-dependent

The defect appears when lock wait × queue length exceeds 5 s. On the reference host (a shared Docker Desktop VM), a single order transaction takes about 100–400 ms. On faster hardware, 16 buyers may never reach 5 s, so CON-11 skips itself with the reason "precondition not reached" rather than reporting a misleading pass.

## Business impact

Customers retry after a 500, which creates duplicate real orders (see R-04, no idempotency). Support sees orders that "failed". Inventory is consumed silently.

## Suggested remediation

1. Shorten the critical section: use an atomic conditional decrement, so there is no interactive transaction and the lock is held for a single statement.
2. Map Prisma transaction errors (`P2028`, timeouts) to `503 Retry-After` and log them.
3. Support `Idempotency-Key` on `POST /orders`, so a client retry can't duplicate an order that did commit.

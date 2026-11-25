# BUG-006 – Concurrent status updates are all acknowledged (double payment confirmation, ship + cancel)

| Field               | Value                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Bug ID              | BUG-006                                                                                         |
| Component           | Orders – `PATCH /api/orders/:id/status` (concurrency)                                           |
| Application version | orderflow-api `259c7d0e`                                                                        |
| Severity            | **High** – clients are told contradictory things about an order's state                         |
| Priority            | **P2**                                                                                          |
| Reproduction rate   | 15/15 (CON-05, CON-06, CON-10, each 5/5 in `--repeat-each=5`), plus 5/5 in a first CON-05 batch |
| Status              | Open – confirmed by automation                                                                  |
| Automated tests     | `tests/concurrency/order-concurrency.spec.ts` › CON-05, CON-06, CON-10 (`test.fail`)            |

## Description

The state machine works for sequential requests: LC-03 exhaustively verifies that every forbidden transition is rejected. Under concurrency it breaks. The service reads the current status, validates the transition in memory, then writes without a condition, so every concurrent request validates against the same stale status.

## Steps to reproduce

**A – double payment confirmation:** create a `PENDING` order, then send 8 concurrent `PATCH …/status {"status":"PAID"}` requests.
**B – conflicting transitions:** for a `PAID` order, send `SHIPPED` and `CANCELLED` concurrently.
**C – duplicate cancellation:** send 5 concurrent `CANCELLED` requests.

## Expected result

Exactly one request succeeds (200). The others get `400 Order is already …`, or `409 Conflict`.

## Actual result

| Scenario | Observed statuses (example)                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A        | `[200, 200, 200, 200, 200, 200, 200, 200]`: 8 payment confirmations acknowledged                                                               |
| B        | `ship=200 cancel=200`. The final state was `CANCELLED` in 8 of 10 runs and `SHIPPED` in 2 of 10, so one client is always told something false. |
| C        | `[200, 200, 200, 200, 200]`                                                                                                                    |

## Root cause (verified)

`orders.service.ts` `updateStatus`: line 106 runs `findUnique`, line 111 runs `assertTransition(order.status, status)` in memory, and line 113 runs `order.update({ where: { id } })` without the expected previous status in the `WHERE` clause.

## Business impact

- Payment webhooks or retries can be processed several times, and each one is acknowledged.
- A warehouse may ship an order that the customer service tool successfully cancelled.
- Once restocking on cancel exists (BUG-003), duplicate cancellations would restock several times.

## Suggested remediation

Use an optimistic conditional update, `UPDATE "Order" SET status = $to WHERE id = $id AND status = $from`, and treat 0 affected rows as `409 Conflict`. Alternatively use `SELECT … FOR UPDATE` inside a transaction.

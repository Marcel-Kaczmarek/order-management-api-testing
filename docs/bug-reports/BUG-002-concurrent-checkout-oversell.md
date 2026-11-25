# BUG-002 – Concurrent checkouts oversell limited stock

| Field               | Value                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Bug ID              | BUG-002                                                                                              |
| Component           | Orders – `POST /api/orders` (concurrency)                                                            |
| Application version | orderflow-api `259c7d0e`                                                                             |
| Severity            | **High** – overselling, negative inventory                                                           |
| Priority            | **P1**                                                                                               |
| Reproduction rate   | **10/10** Playwright runs (CON-04, `--repeat-each=5` twice) and 5/5 rounds of the standalone harness |
| Status              | Open – confirmed by automation                                                                       |
| Automated test      | `tests/concurrency/order-concurrency.spec.ts` › CON-04 (`test.fail`)                                 |

## Description

Stock is read and validated **before** the database transaction starts, and is then decremented without re-checking. Concurrent requests all read the same pre-decrement stock, all pass validation, and all commit.

## Preconditions

A product with `stock = 3`, and 12 distinct authenticated customers.

## Steps to reproduce

1. Create a product with `stock: 3`.
2. Fire 12 `POST /api/orders` requests concurrently, each for `quantity: 1`, one per customer.
3. Read the product's stock.

## Expected result

Exactly 3 orders are accepted (201) and 9 are rejected (`400 Insufficient stock`). Final stock is 0.

## Actual result

| Run                                              | Accepted                      | Rejected | Final stock        |
| ------------------------------------------------ | ----------------------------- | -------- | ------------------ |
| Prototype harness, rounds 1–5                    | 12, 10 (+2 × 500), 12, 12, 12 | 0        | −9, −8, −9, −9, −9 |
| `npm run repro:contention -- 12 3 5`, rounds 1–5 | 12, 12, 12, 12, 12            | 0        | −9 in every round  |
| Playwright CON-04 × 10                           | 4–12                          | 0        | down to −9         |

Example assertion output: `orders accepted must not exceed stock – Expected: 3, Received: 12`.

## Evidence

- The `observed` annotation on CON-04 in the Playwright and Allure reports, for example `accepted=12 rejected=0 stock=-9`.
- Database: `stock + Σ(non-cancelled ordered units) = 3 + 12 ≠ 3`, so `expectInventoryConserved` fails.

## Root cause (verified)

`orders.service.ts` lines 20–33 read the products and check stock _outside_ the transaction. Lines 46–50 open the transaction and decrement unconditionally. There is no row lock (`SELECT … FOR UPDATE`), no conditional update, and no `CHECK` constraint.

## Business impact

Flash sales and limited stock are oversold, leading to cancellations, refunds and loss of customer trust.

## Suggested remediation

Move validation into the transaction as an atomic conditional decrement (`… WHERE stock >= $q`, checking the affected row count), or lock the rows with `SELECT … FOR UPDATE` before validating. Add `CHECK (stock >= 0)`. Then remove `test.fail` from CON-04.

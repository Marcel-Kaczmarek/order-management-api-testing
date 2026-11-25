# BUG-003 – Cancelling an order does not return reserved units to inventory

| Field               | Value                                                                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bug ID              | BUG-003                                                                                                                                                                                                                                                                                                           |
| Component           | Orders – `PATCH /api/orders/:id/status` → `CANCELLED`                                                                                                                                                                                                                                                             |
| Application version | orderflow-api `259c7d0e`                                                                                                                                                                                                                                                                                          |
| Severity            | **Medium** – sellable inventory is permanently lost                                                                                                                                                                                                                                                               |
| Priority            | **P2**                                                                                                                                                                                                                                                                                                            |
| Reproduction rate   | 100 %                                                                                                                                                                                                                                                                                                             |
| Requirement basis   | _Inferred._ The AUT README documents stock decrement on order creation and `CANCELLED` as a terminal state, but says nothing about restocking. Standard order-management practice (and the brief's workflow "order cancellation and inventory restoration") expects restocking. Needs product-owner confirmation. |
| Status              | Open – confirmed by automation, requirement pending confirmation                                                                                                                                                                                                                                                  |
| Automated test      | `tests/regression/known-defects.spec.ts` › "BUG-003 …"                                                                                                                                                                                                                                                            |

## Steps to reproduce

1. Create a product with `stock: 10`.
2. As a customer, order `quantity: 4`. Stock is now 6.
3. As admin, send `PATCH /api/orders/<id>/status` with `{"status":"CANCELLED"}` and receive `200`.
4. `GET /api/products/<id>`.

## Expected result

Stock returns to **10**. The cancelled order no longer holds inventory.

## Actual result

Stock stays at **6**. Assertion output: `Expected: 10, Received: 6`.

## Evidence

- Probe on 2026-11-24: the order was cancelled with `200` (`"status":"CANCELLED"`) and the product stock did not change afterwards.
- `expectInventoryConserved` (stock + units held by non-cancelled orders) fails after cancellation.

## Root cause (verified)

`orders.service.ts` `updateStatus` (lines 101–117) only calls `assertTransition` and `prisma.order.update({ data: { status } })`. No code path increments `Product.stock`.

## Business impact

Every cancellation permanently removes sellable units, and products show as out of stock while units sit on the shelf. This also inflates the impact of BUG-001 and BUG-002, because over-reserved stock is never released.

## Suggested remediation

In one transaction with a conditional status update, set the status to `CANCELLED` and increment stock by each item's quantity. This should only happen if the previous status was `PENDING` or `PAID`, which prevents double restocking (see BUG-006).

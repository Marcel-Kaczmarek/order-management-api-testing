# BUG-004 – Out-of-range integers cause HTTP 500 instead of a validation error

| Field               | Value                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Bug ID              | BUG-004                                                                                                    |
| Component           | Products (`POST/PATCH /api/products`), Orders (`POST /api/orders`)                                         |
| Application version | orderflow-api `259c7d0e`                                                                                   |
| Severity            | **Medium** – a client input error is reported as a server failure, and checkout fails for high-value carts |
| Priority            | **P3**                                                                                                     |
| Reproduction rate   | 100 %                                                                                                      |
| Status              | Open – confirmed by automation                                                                             |
| Automated test      | `tests/regression/known-defects.spec.ts` › "BUG-004 …"; atomicity is checked separately by INT-07 (passes) |

## Steps to reproduce

**A – product price:**

1. As admin, send `POST /api/products` with `{"name":"QA-Big","priceCents":3000000000,"stock":1}`.

**B – order total:**

1. Create a product with `priceCents: 2147483646` (valid, just below INT4 max) and `stock: 10`.
2. As a customer, order `quantity: 2`. The total of 4,294,967,292 exceeds INT4.

## Expected result

`400 Bad Request` with a field message (for example `priceCents must not be greater than 2147483647`) for A, and a business validation error for B.

## Actual result

Both return **`500 Internal Server Error`**:

```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "Internal server error",
  "path": "/api/products",
  "timestamp": "2026-11-24T21:08:49.695Z"
}
```

## Database evidence

In case B the stock decrement had already run inside the transaction. INT-07 verifies that the transaction **rolls back** correctly: stock stays at 10 and no order or order items persist. Data integrity holds, and only the error handling is wrong.

## Root cause (verified)

- `create-product.dto.ts` lines 23–29 and `create-order.dto.ts` lines 18–19 declare `@IsInt() @Min(…)` with **no `@Max`**, although the columns are PostgreSQL `INTEGER` (INT4).
- `orders.service.ts` computes `totalCents` without bounds checking.
- Prisma rejects the out-of-range value with a non-HTTP exception, which the global filter (`http-exception.filter.ts` lines 17–21) maps to 500.

## Business impact

B2B or high-value orders fail with a generic server error. Monitoring sees 5xx spikes for what are client errors, and on-call time is wasted.

## Suggested remediation

Add `@Max(2147483647)` to integer DTO fields, or use `BigInt`/`Decimal` columns for money. Validate the computed total before persisting. Map Prisma validation errors to 400 in the exception filter.

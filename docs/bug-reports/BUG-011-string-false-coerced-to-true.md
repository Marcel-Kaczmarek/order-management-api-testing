# BUG-011 – String `"false"` is stored as boolean `true` (implicit type conversion)

| Field               | Value                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Bug ID              | BUG-011                                                                                                                  |
| Component           | Global `ValidationPipe` (`main.ts`) and products DTOs                                                                    |
| Application version | orderflow-api `259c7d0e`                                                                                                 |
| Severity            | **Medium** – silent data inversion. The request succeeds and stores the opposite value.                                  |
| Priority            | **P2**                                                                                                                   |
| Reproduction rate   | 100 %                                                                                                                    |
| Status              | Open – confirmed by automation                                                                                           |
| Automated test      | known-defects.spec.ts › "BUG-011 …". Related behaviour is pinned in `tests/negative/type-coercion.spec.ts` (TYP-01..05). |

## Steps to reproduce

1. As admin, send `POST /api/products` with `{"name":"QA-Coercion","priceCents":"1500","stock":"3","isActive":"false"}`.
2. Or `PATCH /api/products/<id>` with `{"isActive":"false"}`.

## Expected result

Either `400 isActive must be a boolean value` (strict typing), or the value is interpreted as `false`.

## Actual result

`201` / `200` with **`"isActive": true`**:

```json
{"id":"cmwv6z6wo00h6ro01fc166w3y","name":"QA-Coercion","priceCents":1500,"stock":3,"isActive":true,…}
```

A genuine boolean `false` works correctly (TYP-05).

## Root cause (verified)

`main.ts` line 16 sets `transformOptions: { enableImplicitConversion: true }`. class-transformer therefore converts the JSON string to the DTO's declared `boolean` type with JavaScript semantics, `Boolean("false") === true`, **before** `@IsBoolean()` runs. The same option also explains why numeric strings and numbers pass as integers and strings (TYP-01, TYP-03, TYP-04). The option is meant for query-string parameters but applies globally to request bodies.

## Business impact

An admin UI or integration that sends form values as strings re-activates or keeps active a product it meant to withdraw, with no error. This silently corrupts catalog state.

## Suggested remediation

Disable implicit conversion globally and use explicit `@Type(() => Number)` only on the query DTOs that need it (the PaginationDto already has it). Alternatively, add `@Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)` to boolean fields.

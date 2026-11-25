# BUG-009 – NUL byte in a path parameter returns 500

| Field               | Value                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Bug ID              | BUG-009                                                                                          |
| Component           | Products and orders – `GET /:id` routes                                                          |
| Application version | orderflow-api `259c7d0e`                                                                         |
| Severity            | **Low** – error handling and log noise only. The SQL is parameterized, so there is no injection. |
| Priority            | **P4**                                                                                           |
| Reproduction rate   | 100 %                                                                                            |
| Status              | Open – confirmed by automation                                                                   |
| Automated test      | known-defects.spec.ts › "BUG-009 …"                                                              |

## Steps to reproduce

Send `GET /api/products/%00`, or `GET /api/orders/abc%00def` with a valid token.

## Expected result

`404 Not Found`, the same as for any other non-existent identifier (PRD-10 confirms this for `' OR '1'='1`, UUIDs and so on).

## Actual result

```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "Internal server error",
  "path": "/api/products/%00",
  "timestamp": "2026-11-24T21:28:02.186Z"
}
```

## Database evidence and root cause (verified)

PostgreSQL log, at the same timestamp as the probe request:

```text
2026-11-24 21:08:50.498 UTC [654] ERROR:  invalid byte sequence for encoding "UTF8": 0x00
```

The id is passed straight to `findUnique({ where: { id } })` with no format validation. PostgreSQL text columns can't contain NUL, the driver error isn't an `HttpException`, and the filter maps it to 500.

## Suggested remediation

Validate route identifiers, for example with a `ParseCuidPipe` or `@Matches(/^c[a-z0-9]{24}$/)`, and return 404 or 400 for malformed values.

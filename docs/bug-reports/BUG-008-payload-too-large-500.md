# BUG-008 – Oversized JSON body returns 500 instead of 413

| Field               | Value                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Bug ID              | BUG-008                                                                                                 |
| Component           | HTTP layer / global exception filter                                                                    |
| Application version | orderflow-api `259c7d0e`                                                                                |
| Severity            | **Low** – the request is correctly rejected, but with the wrong status                                  |
| Priority            | **P3**                                                                                                  |
| Reproduction rate   | 100 %                                                                                                   |
| Status              | Open – confirmed by automation                                                                          |
| Automated tests     | known-defects.spec.ts › "BUG-008 …" (`test.fail`). SEC-08 (passing) verifies that nothing is persisted. |

## Steps to reproduce

As an authenticated customer, send `POST /api/orders` with a JSON body of about 1 MB: 20,000 items of `{"productId":"cplaceholderplaceholder000","quantity":1}`.

## Expected result

`413 Payload Too Large`. The client can tell the request was too large.

## Actual result

```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "Internal server error",
  "path": "/api/orders",
  "timestamp": "2026-11-24T21:28:02.197Z"
}
```

Nothing is persisted (SEC-08), and no stack trace is leaked.

## Root cause

_Partially verified._ The body exceeds the Express JSON parser's default 100 kB limit. The global `HttpExceptionFilter` (`@Catch()` with no arguments, lines 17–21) turns every exception that isn't a NestJS `HttpException` into 500, ignoring the parser error's own `status` (413). It is **not verified** why malformed JSON keeps its 400 while this error does not.

## Business impact

Low. Monitoring counts client mistakes as server errors, and API consumers get no actionable feedback.

## Suggested remediation

In the filter, honour the `status` or `statusCode` property of non-HTTP errors when it is a 4xx. Optionally lower the body limit for `/orders` and bound `items` with `@ArrayMaxSize`.

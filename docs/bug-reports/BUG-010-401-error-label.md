# BUG-010 – 401 responses from the JWT guard carry `"error": "Internal Server Error"`

| Field               | Value                                                    |
| ------------------- | -------------------------------------------------------- |
| Bug ID              | BUG-010                                                  |
| Component           | Global `HttpExceptionFilter` and Passport `JwtAuthGuard` |
| Application version | orderflow-api `259c7d0e`                                 |
| Severity            | **Low** – a misleading error contract                    |
| Priority            | **P4**                                                   |
| Reproduction rate   | 100 %                                                    |
| Status              | Open – confirmed by automation                           |
| Automated test      | known-defects.spec.ts › "BUG-010 …"                      |

## Steps to reproduce

Send `GET /api/users/me` with no `Authorization` header, or with an invalid or expired token.

## Expected result

```json
{"statusCode":401,"error":"Unauthorized","message":"Unauthorized", …}
```

That matches the envelope for other statuses (for example `400 Bad Request` and `403 Forbidden`).

## Actual result

```json
{
  "statusCode": 401,
  "error": "Internal Server Error",
  "message": "Unauthorized",
  "path": "/api/users/me",
  "timestamp": "2026-11-24T21:08:50.435Z"
}
```

Login failures (`401 Invalid credentials`) are labelled correctly, because they are thrown with an explicit message.

## Root cause (verified)

Passport throws `new UnauthorizedException()` with no arguments, so its response body is `{ message: 'Unauthorized', statusCode: 401 }` with **no `error` key**. In `http-exception.filter.ts`, line 30 (`error = payload.error ?? error`) falls back to the default from line 19, `'Internal Server Error'`. The status-name lookup (`HttpStatus[status]`) is applied only to string bodies (line 26).

## Business impact

Clients that branch on `error`, and log or alert rules matching "Internal Server Error", misclassify every expired session as a server fault.

## Suggested remediation

In the filter, fall back to `HttpStatus[status]` for object bodies as well.

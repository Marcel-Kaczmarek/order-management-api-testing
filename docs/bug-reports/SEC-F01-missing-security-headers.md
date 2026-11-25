# SEC-F01 – Framework fingerprinting header and missing hardening headers

| Field               | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| Finding ID          | SEC-F01 (OWASP API8:2023 Security Misconfiguration)       |
| Application version | orderflow-api `259c7d0e`                                  |
| Severity            | **Low**                                                   |
| Priority            | **P3**                                                    |
| Reproduction rate   | 100 %                                                     |
| Automated test      | `tests/security/owasp-api.spec.ts` › SEC-12 (`test.fail`) |

## Evidence

Response headers of `GET /api/products?limit=1` (captured 2026-11-24, complete list apart from Date, Connection and Content-Length):

```http
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
ETag: W/"120-5FZy75GKQeG5acF8eQgSUFywNPg"
```

## Expected

No technology disclosure (`X-Powered-By` removed). Baseline headers for an API: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` on authenticated responses, and `Strict-Transport-Security` once TLS is used.

## Root cause (verified)

`main.ts` doesn't call `app.disable('x-powered-by')` or register `helmet`.

## Remediation

`app.use(helmet())` (or at minimum `app.getHttpAdapter().getInstance().disable('x-powered-by')`), plus `Cache-Control: no-store` for `/users/*` and `/orders/*`.

## Not affected (verified)

CORS is not enabled, so no `Access-Control-Allow-Origin` header is sent to arbitrary origins (SEC-10). Error bodies never contain stack traces (SEC-06).

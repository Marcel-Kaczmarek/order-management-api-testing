# SEC-F02 – No rate limiting or lockout on authentication

| Field               | Value                                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finding ID          | SEC-F02 (OWASP API2:2023 Broken Authentication, API4:2023 Unrestricted Resource Consumption)                                                                                                                           |
| Application version | orderflow-api `259c7d0e`                                                                                                                                                                                               |
| Severity            | **Medium**                                                                                                                                                                                                             |
| Priority            | **P2**                                                                                                                                                                                                                 |
| Reproduction rate   | 100 %                                                                                                                                                                                                                  |
| Automated test      | `tests/security/owasp-api.spec.ts` › SEC-09. This is an _observation_ test: it pins the current behaviour and records it in an annotation. Rate limiting is not an AUT requirement, so it isn't asserted as a failure. |

## Steps to reproduce

Send 25 concurrent `POST /api/auth/login` requests with wrong passwords for an existing account, then log in with the correct password.

## Observed

All 25 return `401 Invalid credentials` (no `429`, no delay), and the correct password still works immediately afterwards. The k6 smoke profile also logged in repeatedly without any throttling.

## Risk

Online password guessing and credential stuffing are limited only by bcrypt's cost (about 50 ms per attempt in the local k6 run). Because bcrypt is CPU-bound, the login endpoint is also a cheap way to consume server CPU.

## Positive observations (verified)

Responses don't reveal whether an account exists: the unknown-user and wrong-password responses are identical (AUTH-05). Passwords are stored as bcrypt cost-10 hashes (DB-01).

## Remediation

Add `@nestjs/throttler` with tight limits on `/auth/login` and `/auth/register`, keyed by IP and by account. Consider progressive delays or temporary lockout, plus monitoring for failed-login spikes.

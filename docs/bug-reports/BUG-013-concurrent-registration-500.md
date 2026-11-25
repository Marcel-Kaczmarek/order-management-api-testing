# BUG-013 – Concurrent duplicate registration returns 500 instead of 409

| Field               | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| Bug ID              | BUG-013                                                            |
| Component           | Auth – `POST /api/auth/register`                                   |
| Application version | orderflow-api `259c7d0e`                                           |
| Severity            | **Low** – data integrity holds, only the error contract is wrong   |
| Priority            | **P3**                                                             |
| Reproduction rate   | 10/10 runs (CON-08 and CON-09 under `--repeat-each=5`)             |
| Status              | Open – confirmed by automation                                     |
| Automated tests     | CON-08 (integrity, passing) and CON-09 (status codes, `test.fail`) |

## Steps to reproduce

Fire 5 concurrent `POST /api/auth/register` requests with the **same** new email address.

## Expected result

One `201`, four `409 Email already registered` (the same response a sequential duplicate gets, see REG-03).

## Actual result

`[201, 500, 500, 500, 500]` in every run. The database contains exactly one user (verified by CON-08 and DB-11).

## Database evidence and root cause (verified)

PostgreSQL log:

```text
ERROR:  duplicate key value violates unique constraint "User_email_key"
```

`auth.service.ts` follows a check-then-act pattern. It runs `findUnique` (line 21), then `bcrypt.hash` (line 28, roughly 100 ms, which widens the window), then `user.create` (line 29). Concurrent requests all pass the check. The unique index correctly rejects all but one, but the Prisma `P2002` error isn't mapped, so the filter returns 500.

## Business impact

A double-clicked sign-up shows "server error" although the account was created. Monitoring sees 5xx.

## Suggested remediation

Catch Prisma `P2002` on `User.email` and throw `ConflictException`. The pre-check can stay as a fast path.

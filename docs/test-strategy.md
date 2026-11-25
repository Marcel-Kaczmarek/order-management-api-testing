# Test Strategy – Enterprise Order Management API

| Item              | Value                                                             |
| ----------------- | ----------------------------------------------------------------- |
| Document          | Test Strategy                                                     |
| System under test | OrderFlow API (`andriiops/orderflow-api` @ `259c7d0e`)            |
| Framework         | `order-management-api-testing` (this repository)                  |
| Status            | Baseline v1.0                                                     |
| Context           | Independent QA engineering portfolio project, not commercial work |

## 1. Project overview

OrderFlow API is a NestJS 11 / Prisma 6 / PostgreSQL 16 backend. It covers customer accounts, JWT authentication with two roles (`ADMIN`, `CUSTOMER`), a product catalog with inventory (`Product.stock`), and an order lifecycle (`PENDING → PAID → SHIPPED → DELIVERED`, or `CANCELLED` from `PENDING`/`PAID`). This repository is the QA framework that tests the API. The application itself is vendored, unmodified, under [`application-under-test/`](../application-under-test). See [UPSTREAM.md](../application-under-test/UPSTREAM.md).

## 2. Business objectives

| ID   | Objective                                                                          |
| ---- | ---------------------------------------------------------------------------------- |
| BO-1 | Customers can register, authenticate and place orders for available products.      |
| BO-2 | Revenue integrity: customers are charged exactly the catalog price at checkout.    |
| BO-3 | Inventory integrity: stock is never oversold and always reflects committed orders. |
| BO-4 | Fulfilment follows a controlled, auditable state machine.                          |
| BO-5 | Customer data and orders are private to their owner; administration is restricted. |

## 3. Quality objectives

| ID   | Objective                                           | Measured by                                                  |
| ---- | --------------------------------------------------- | ------------------------------------------------------------ |
| QO-1 | Every business rule has an executable oracle.       | RTM coverage (docs/requirements-traceability-matrix.md)      |
| QO-2 | API responses honour a stable contract.             | JSON-Schema validation on every endpoint                     |
| QO-3 | API results are persisted faithfully.               | API ↔ PostgreSQL assertions                                  |
| QO-4 | No unauthorised access paths.                       | RBAC/BOLA/token suites, all negative paths 401/403           |
| QO-5 | Invariants hold under concurrency.                  | Concurrency suite (nightly)                                  |
| QO-6 | Latency is acceptable for a single-node deployment. | k6 thresholds (proposed criteria)                            |
| QO-7 | Results are trustworthy.                            | No hidden retries (flaky = failure in CI), no disabled tests |

## 4. Scope

**In scope.** All 13 REST operations declared in the AUT's OpenAPI document: auth, users, products, orders and order status. This covers business rules in `OrdersService`/`ProductsService`, request validation (global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`), the error envelope (`HttpExceptionFilter`), the PostgreSQL schema and data, concurrency behaviour, non-destructive OWASP API Top 10 checks, and latency under load.

**Out of scope** (each one is absent from the AUT, so it is not invented here):

| Not tested                                             | Reason                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Refresh tokens, logout and token revocation            | Not implemented. Tokens are stateless and expire after `JWT_EXPIRES_IN`.                                                                    |
| Payments, taxes and discounts                          | Not implemented. "Payment" is simulated by the `PENDING → PAID` transition.                                                                 |
| Shipments as an entity, categories, audit log tables   | Not part of the Prisma schema. Shipment is a status, and the audit trail is limited to `createdAt`/`updatedAt` plus retained order items.   |
| Redis, RabbitMQ, background jobs, eventual consistency | The selected AUT is synchronous and single-process. Candidate `exralvio/nestjs-order-api` has Redis/RabbitMQ but is `UNLICENSED` (see §14). |
| Filtering and sorting                                  | Not implemented. Unknown query parameters are rejected (tested in LST-09).                                                                  |
| Frontend/UI                                            | No UI in scope. All testing is at the API and database level.                                                                               |
| Code coverage of the AUT                               | Not instrumented. No code-coverage claims are made (see §12).                                                                               |

## 5. Risk-based approach

Test depth follows the [risk assessment](risk-assessment.md). High-severity risks have tests at three layers: API behaviour, database state and concurrency. Those risks are revenue (totals and price tampering), inventory (overselling, negative stock, restocking), access control (BOLA, RBAC, token forgery) and state-machine corruption. Lower risks get API-level checks only.

## 6. Test levels

| Level                   | Where                                                                    | Notes                                                                             |
| ----------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Unit                    | AUT only (`order-status.spec.ts`, upstream Jest)                         | Not owned by this framework.                                                      |
| Component/API           | `tests/{authentication,authorization,products,orders,negative,contract}` | Black-box over HTTP using Playwright `APIRequestContext`.                         |
| Integration             | `tests/integration`, `tests/database`                                    | API + PostgreSQL together: persistence, transactions, cross-endpoint consistency. |
| System (non-functional) | `tests/concurrency`, `tests/security`, `performance/`                    | Concurrency invariants, OWASP checks, k6 load profiles.                           |

## 7. Test types

Functional, negative/boundary, state-transition (exhaustive transition table), security (OWASP API Top 10 inspired), schema/contract, database integrity, concurrency/idempotency, performance (smoke/load/stress/spike), exploratory ([exploratory-testing.md](exploratory-testing.md)) and regression (tag-driven, including known-defect reproductions).

## 8. Automation approach

- **Tooling:** Playwright Test with `APIRequestContext`, TypeScript in strict mode, Ajv 2020 JSON Schema, node-postgres, Faker, Zod, Newman and k6.
- **Architecture:** Service Object Model. Typed clients (`src/clients`) handle the HTTP mechanics only. Fixtures (`src/fixtures`) own lifecycle: sessions, data and cleanup. Assertions (`src/assertions`) encode business invariants. Repositories (`src/database`) hold parameterized read-only SQL. [Architecture](architecture/README.md) has the diagrams.
- **Isolation:** every test creates its own customers and products. There is no ordering between tests, and `fullyParallel` is on.
- **Determinism:** no sleeps. Asynchronous state is checked with bounded polling (`pollUntil`). Assertions that depend on shared data are relative (for example meta arithmetic) rather than exact counts.
- **Tags:** `@smoke @regression @api @authentication @authorization @integration @database @contract @security @negative @concurrency @known-defect`. Each tag has an npm script.
- **Known defects:** reproductions assert the _correct_ behaviour and are marked `test.fail()` with the bug ID. They stay visible in every report. When a bug is fixed, the test reports an unexpected pass and breaks the build until the marker is removed, so a fixed bug can't go unnoticed.
- **Postman/Newman:** exploration plus representative chained workflows (27 requests, 65 assertions). It does not duplicate the Playwright suite.

## 9. Test environment

A local Docker Compose stack: `postgres:16-alpine` plus the AUT image built from the pinned source. CI uses the same compose file on GitHub-hosted runners. Default ports are API `3000` and PostgreSQL `55432`. The framework refuses to run against non-local hosts (Zod guard in `src/config/env.ts`). Database validation uses the `qa_readonly` role (SELECT only, `default_transaction_read_only=on`). Test DB-12 proves that the role can't write.

## 10. Test data management

- Faker instances are seeded with `FAKER_SEED` plus a per-test salt (the Playwright `testId`), so a test generates the same content on every run.
- Unique keys such as e-mail addresses also embed a run token, because the database persists between runs.
- All data is created through the public API, never through SQL writes.
- Test products carry the `QA-` prefix and are soft-deleted by fixture teardown. A global teardown sweep catches leftovers. Users and orders can't be deleted through the API, so they are isolated by uniqueness. `npm run env:reset` gives a pristine database.
- Performance and Postman runs use dedicated `PERF-` reference products from `npm run seed`, so they never drain the demo catalog.

## 11. Entry and exit criteria

**Entry:** the AUT builds and passes its health check, and `npm run health-check` is green (API, OpenAPI, admin login, read-only DB role). Lint and type-check pass.

**Exit (per release candidate):**

1. 100 % of smoke tests pass.
2. No _unexpected_ failures in the regression suite. Known-defect tests may fail only as `expected`.
3. Zero flaky tests in CI (`failOnFlakyTests`).
4. Every requirement in the RTM has at least one automated test, or a documented exception.
5. Open defects have a bug report with severity, priority and evidence. No open Critical defects without a stakeholder waiver.
6. The k6 smoke profile meets the proposed thresholds.

## 12. Coverage definitions

These three are reported separately and never mixed:

- **Requirements coverage:** requirements with ≥ 1 automated test, from the RTM.
- **Endpoint coverage:** OpenAPI operations exercised, from OAS-01. All 13 are covered.
- **Code coverage:** not measured. The AUT is not instrumented, so this framework makes no code-coverage claim.

## 13. Defect management

Defects are logged in Jira format in `docs/bug-reports/`, with severity (impact) and priority (urgency), reproduction steps, captured request/response evidence, database evidence, verified root cause and suggested remediation. Each verified defect gets a `test.fail()` reproduction test in `tests/regression/known-defects.spec.ts` or the concurrency suite. Lifecycle: _New → Confirmed (reproduced by automation) → Reported upstream → Fixed → Verified (marker removed, regression test green)_.

## 14. Status-code contract notes

Expected codes are taken from the AUT's code, not from generic REST conventions:

- **400** covers all validation errors, including unknown properties (mass assignment) and business-rule violations (insufficient stock, invalid transitions). The AUT does not use **422**.
- An unsupported `Content-Type` produces **400**, not **415**: Express doesn't parse the body, so DTO validation fails.
- An unsupported HTTP method produces **404**, not **405**, because NestJS has no route for it.
- **429** is never returned, because there is no rate limiting. This is recorded as finding SEC-F02.
- **204** is never used. DELETE returns **200** with the soft-deleted resource.

## 15. CI/CD integration

| Workflow                 | Trigger   | Content                                                                                                                                 |
| ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                 | push/PR   | ESLint, Prettier, `tsc`, Postman collection drift check, compose validation                                                             |
| `api-tests.yml`          | push/PR   | Compose up → health/seed → smoke gate → full functional run without `@concurrency` → HTML/Allure/JUnit reports and artifacts → teardown |
| `nightly-regression.yml` | 02:00 UTC | Full suite including concurrency and security, plus Newman                                                                              |
| `performance-tests.yml`  | manual    | k6 profile of your choice with thresholds enforced and summary published                                                                |

## 16. Reporting

Playwright HTML, Allure 3, JUnit XML (published as a GitHub check), Playwright JSON → generated `reports/summary.md` (`npm run report:summary`), Newman htmlextra + JUnit, and k6 JSON + Markdown summaries. Failed and known-defect tests carry a sanitized `http-exchanges.json` attachment. Tokens and passwords are redacted, and Playwright traces are opt-in only because they would capture raw tokens.

## 17. Assumptions

- The AUT's README and code are the requirements baseline. Where they are silent, the expectation is labelled _inferred_, as in BUG-003.
- The local environment is representative enough for functional testing. Performance numbers are indicative only (shared developer hardware, single API instance).

## 18. Known limitations

- Concurrency defects are timing-dependent. Their reproduction rate is measured and documented rather than assumed.
- Schema tests pin the provider's _current_ shape. They are not consumer-driven contracts (no Pact broker or consumer pacts).
- The AUT can't delete users or orders, so test data accumulates in a long-lived database until `env:reset`.

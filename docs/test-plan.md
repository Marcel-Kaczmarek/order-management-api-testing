# Test Plan – OrderFlow API v1.0 (`259c7d0e`)

Derived from the [Test Strategy](test-strategy.md). Execution results are in [test-execution-summary.md](test-execution-summary.md).

## 1. Features under test

| Feature                                               | Endpoints                                              | Requirements     | Suites                                                |
| ----------------------------------------------------- | ------------------------------------------------------ | ---------------- | ----------------------------------------------------- |
| F1 Registration & authentication                      | `POST /auth/register`, `POST /auth/login`              | REQ-AUTH-01..05  | `tests/authentication`                                |
| F2 Authorization (RBAC, ownership)                    | all protected routes                                   | REQ-AUTHZ-01..04 | `tests/authorization`, `tests/security`               |
| F3 Customer profile & directory                       | `GET /users/me`, `GET /users`                          | REQ-USR-01..02   | `tests/authorization`, `tests/contract`               |
| F4 Product catalog & inventory                        | `GET/POST /products`, `GET/PATCH/DELETE /products/:id` | REQ-PRD-01..06   | `tests/products`, `tests/integration`                 |
| F5 Order placement & pricing                          | `POST /orders`                                         | REQ-ORD-01..07   | `tests/orders`, `tests/integration`, `tests/database` |
| F6 Order retrieval & history                          | `GET /orders`, `GET /orders/:id`                       | REQ-ORD-08..09   | `tests/orders`, `tests/authorization`                 |
| F7 Order lifecycle                                    | `PATCH /orders/:id/status`                             | REQ-LC-01..04    | `tests/orders/order-lifecycle.spec.ts`                |
| F8 Data integrity                                     | PostgreSQL schema & data                               | REQ-DATA-01..05  | `tests/database`                                      |
| F9 Non-functional: concurrency, security, performance | –                                                      | REQ-NFR-01..05   | `tests/concurrency`, `tests/security`, `performance/` |

## 2. Test deliverables

| Deliverable                                 | Location                                |
| ------------------------------------------- | --------------------------------------- |
| Strategy, plan, cases, RTM, risk assessment | `docs/`                                 |
| Automated suites (Playwright)               | `tests/`                                |
| Postman collection + environment            | `postman/`                              |
| k6 scripts                                  | `performance/`                          |
| Bug reports (verified)                      | `docs/bug-reports/`                     |
| Exploratory session notes                   | `docs/exploratory-testing.md`           |
| Reports (HTML, Allure, JUnit, k6, Newman)   | `reports/` (generated) and CI artifacts |
| Execution summary with actual metrics       | `docs/test-execution-summary.md`        |

## 3. Execution approach

1. `npm run setup` builds and starts the environment, then health-checks and seeds it.
2. Smoke gate: `npm run test:smoke`.
3. Functional regression: `npx playwright test --grep-invert @concurrency` (the PR pipeline).
4. Concurrency and full regression: `npm run test:regression`, and `npm test` for everything (nightly).
5. Postman: `npm run test:postman`.
6. Performance: `npm run test:performance` (smoke profile), with load/stress/spike run manually.
7. Exploratory sessions are time-boxed (charters in `exploratory-testing.md`).
8. Failure triage: decide whether a failure is a framework defect or an application defect. Framework defects are fixed. Application defects are reproduced, documented, and protected by a `test.fail()` reproduction.

## 4. Dependencies

- Docker Engine/Desktop with Compose v2, Node.js ≥ 22, and network access for npm and Docker Hub on the first build.
- The AUT's own seed data: the admin and demo customer accounts.
- k6 binary or the `grafana/k6` Docker image, for performance runs only.

## 5. Acceptance criteria

Same as the exit criteria in the Test Strategy §11: smoke 100 % passing, no unexpected failures, no flaky tests, RTM fully covered or with documented exceptions, every defect documented, and the k6 smoke thresholds met.

## 6. Risks to the test effort

| Risk                                                     | Mitigation                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Timing-dependent defects reproduce intermittently        | Measure and document the reproduction rate. Use high contention (12 parallel buyers for 3 units).                          |
| A shared long-lived database accumulates data            | Relative assertions, unique data, QA prefix, and `env:reset`.                                                              |
| The developer machine is slow or shared (Docker Desktop) | QA packaging of the AUT (`docker/aut.Dockerfile`) and bounded health polling. Performance numbers are labelled indicative. |
| Upstream AUT changes                                     | Pinned commit plus OpenAPI drift test OAS-01.                                                                              |

## 7. Environment requirements

| Component     | Version                     | Port                |
| ------------- | --------------------------- | ------------------- |
| PostgreSQL    | 16-alpine                   | host `55432` → 5432 |
| OrderFlow API | `259c7d0e`, Node 22-alpine  | 3000                |
| Test runner   | Node 22/24, Playwright 1.65 | –                   |

## 8. Responsibilities

This is a single-author portfolio project, but the same responsibilities would apply on a team:

| Role                            | Responsibility                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| QA Automation Engineer (author) | Strategy, framework, automation, execution, defect reporting                       |
| Developer (upstream)            | Defect triage and fixes                                                            |
| Product owner                   | Confirms _inferred_ requirements (for example restocking on cancellation, BUG-003) |
| DevOps                          | CI runners and secrets (`JWT_SECRET` as a GitHub Actions secret)                   |

# Project Status

_Last updated: 2026-11-24 (local reference host: Windows 11 Pro, Docker Desktop 29.9.3, Node 24.19)_

## Completed

- [x] **Phase 1 – Environment and candidate inspection.** Both candidate AUTs were downloaded at their latest commits and their source, licences and setup inspected.
- [x] **Phase 2 – AUT selected and running.** `andriiops/orderflow-api@259c7d0e` (MIT) is vendored unmodified. All 13 endpoints, the Prisma schema and the business rules were inspected. Docker Compose provides PostgreSQL 16 plus the API, with health checks and a read-only role.
- [x] **Phase 3 – Strategy, plan, architecture** (`docs/test-strategy.md`, `docs/test-plan.md`, `docs/architecture/`).
- [x] **Phase 4 – Core framework:** clients, fixtures, factories, schemas, DB layer, assertions, utilities, Zod config with a local-host guard.
- [x] **Phase 5 – Auth, RBAC/BOLA, CRUD, negative and lifecycle tests.**
- [x] **Phase 6 – Database, contract, integration, concurrency and security tests.**
- [x] **Phase 7 – Postman collection** (generated from TypeScript, 27 requests, 65 assertions) and **k6** smoke/load/stress/spike.
- [x] **Phase 8 – CI/CD workflows**, reporting (HTML, Allure 3, JUnit, JSON summary) and quality gates.
- [x] **Phase 9 – Documentation:** test cases, generated RTM and catalog, risk assessment, exploratory notes, AI-assisted QA module, Mermaid diagrams.
- [x] **Phase 10 – Execution and triage:** framework defects fixed, application defects documented (13 bugs, 2 security findings).
- [x] **Phase 11 – Evidence and README:** screenshots from actual runs (`npm run evidence`).
- [x] **Phase 12 – Final review:** lint, format, type-check and traceability are all green.

## Verified results (local, 2026-11-24)

| Check                                         | Result                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                      | ✅ (485 packages, lockfile committed)                                                                                                                                           |
| `npm run lint` / `format:check` / `typecheck` | ✅ / ✅ / ✅                                                                                                                                                                    |
| `docker compose up -d --build --wait`         | ✅ (requires the QA Dockerfile because of BUG-007)                                                                                                                              |
| `npm run health-check`                        | ✅ API, OpenAPI (9 paths / 13 operations), admin login, read-only DB role                                                                                                       |
| Full Playwright suite (`npm test`)            | **227 tests: 212 passed, 14 known-defect reproductions failed as expected, 0 failed, 0 flaky, 1 skipped** (CON-11 self-skips when the contention timeout isn't reached), 42.1 s |
| Concurrency suite `--repeat-each=5`           | All deterministic tests 5/5. All known-defect races reproduced 5/5. CON-11 reproduced 2/5 and skipped 3/5.                                                                      |
| Newman                                        | ✅ 27 requests, 65 assertions, 0 failures                                                                                                                                       |
| k6 smoke (2 VUs)                              | ❌ write p95 1,277 ms > 1,000 ms (genuine result, threshold not relaxed). Reads p95 5 ms, 0 % errors.                                                                           |
| k6 load (20 VUs)                              | ❌ write p95 5,184 ms; 5.75 % failed orders (BUG-012). Reads p95 74 ms.                                                                                                         |
| k6 spike / stress                             | See `docs/test-execution-summary.md`                                                                                                                                            |
| Traceability                                  | 23 Playwright-covered requirements, 0 unmapped tests, 0 dangling references                                                                                                     |

## Architecture decisions

| #     | Decision                                        | Reason                                                                                                            |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| AD-1  | AUT = orderflow-api (MIT), not nestjs-order-api | The alternative is `UNLICENSED` (not redistributable) and much less reproducible (tenant DBs, async provisioning) |
| AD-2  | Vendor the AUT unmodified, pinned commit        | Reproducibility, and findings refer to a fixed version                                                            |
| AD-3  | QA Dockerfile with identical build stages       | Works around BUG-007 and a very slow upstream runner stage on Docker Desktop                                      |
| AD-4  | Read-only DB role for validation                | Safety: tests can't mutate state behind the API                                                                   |
| AD-5  | Known defects as `test.fail()`                  | Visible, non-masking, and auto-detects fixes                                                                      |
| AD-6  | Tags drive the suites (not folders)             | One test can belong to several slices                                                                             |
| AD-7  | Traces opt-in, sanitized HTTP attachments       | Playwright traces contain raw bearer tokens                                                                       |
| AD-8  | Postman collection generated from TypeScript    | Reviewable scripts, plus a CI drift check                                                                         |
| AD-9  | RTM generated from the live inventory           | The traceability matrix can't drift silently                                                                      |
| AD-10 | Host port 55432 for PostgreSQL                  | 5432 and 5433 were already taken on the reference host                                                            |

## Discovered defects

BUG-001 … BUG-013, SEC-F01 and SEC-F02. See `docs/bug-reports/README.md`. Severity: 5 High, 3 Medium, 5 Low among the bugs, plus 1 Medium and 1 Low security finding.

## Known limitations

- GitHub Actions workflows have **not been executed on GitHub** (the repository hasn't been pushed). They are syntactically validated and mirror the local commands, but CI-specific issues can't be ruled out until the first run.
- Race-condition reproduction rates come from the reference host. On faster CI runners, the BUG-006 tests (CON-05/06/10) might not reproduce. Playwright would then report "expected to fail but passed" and the nightly run would go red. That is intended: it is a visible signal to re-measure, not a silent pass.
- Performance results are indicative (shared Docker Desktop host).
- The AUT has no Redis or RabbitMQ, so there are no messaging or cache tests.
- Code coverage of the AUT is not measured.
- Local `.env` on the reference host sets `ALLURE_RESULTS_DIR` outside the project because of an antivirus file-lock issue. `.env` is git-ignored.

## Pending / next steps (require the repository owner)

1. ~~Replace placeholders in README and LICENSE~~ (done: Marcel-Kaczmarek/order-management-api-testing).
2. Create the GitHub repository, push (**needs your approval**), and optionally add a `JWT_SECRET` Actions secret.
3. Run the workflows once on GitHub, then capture a GitHub Actions screenshot for the README (currently omitted, since none exists yet).
4. Optionally report BUG-001/002/006/007/012 upstream (**needs your approval**, as it is an outward-facing action).

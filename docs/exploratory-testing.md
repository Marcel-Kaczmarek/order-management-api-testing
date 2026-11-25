# Exploratory Testing Sessions

Session-based exploration against the local AUT on 2026-11-24. Each finding was then converted into an automated test, or into a correction of a wrong assumption in the framework. **Wrong assumptions are listed too**, because finding them is the point of exploring before automating.

## Session 1 – Contract reconnaissance (≈ 45 min)

**Charter:** explore the HTTP contract (status codes, envelopes, headers and parsing) to calibrate automated oracles before trusting them.
**Tools:** curl script (`--noproxy` local), Swagger `/api/docs-json`, AUT source.

| #   | Observation                                                                                   | Classification                 | Follow-up                                                                          |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | `POST /auth/login` returns **201**, not 200, because NestJS defaults `@Post()` to 201.        | Framework assumption corrected | Tests, fixtures, health check, k6 and Postman updated. Documented in strategy §14. |
| 2   | Unknown query parameters (`?sort=name`) → `400 property sort should not exist`.               | Contract (safe)                | LST-09                                                                             |
| 3   | `PUT /products/:id` → `404 Cannot PUT …`, not 405.                                            | Contract (NestJS default)      | NEG-04                                                                             |
| 4   | `text/plain` body → 400 validation errors, not 415.                                           | Contract                       | NEG-02                                                                             |
| 5   | Malformed JSON → 400 `Unexpected end of JSON input`.                                          | Contract                       | NEG-01                                                                             |
| 6   | `HEAD /products` → 200, no body.                                                              | Contract                       | NEG-08                                                                             |
| 7   | Missing token → 401, but the envelope says `"error":"Internal Server Error"`.                 | **Defect**                     | BUG-010                                                                            |
| 8   | Response headers include `X-Powered-By: Express`, and there are no hardening headers.         | **Finding**                    | SEC-F01, SEC-12                                                                    |
| 9   | No `Access-Control-Allow-Origin` for a foreign `Origin`.                                      | Positive                       | SEC-10                                                                             |
| 10  | Local requests via `curl` returned **502** because a corporate proxy intercepted `localhost`. | Environment issue              | `NO_PROXY` handling added to the Newman and k6 runners (`bypassProxyForLocalhost`) |

## Session 2 – Inventory & order business rules (≈ 40 min)

**Charter:** try to break inventory integrity using only valid credentials and valid-looking payloads.

| #   | Observation                                                                              | Classification                    | Follow-up      |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------- | -------------- |
| 1   | Two lines of 3 units for a product with stock 5 → **201**, stock **−1**.                 | **Defect**                        | BUG-001        |
| 2   | Cancelling that order → stock stays −1 (no restock).                                     | **Defect** (inferred requirement) | BUG-003        |
| 3   | `priceCents: 3000000000` → **500**.                                                      | **Defect**                        | BUG-004        |
| 4   | A soft-deleted product is still returned by `GET /products/:id` (200, `isActive:false`). | **Defect** (vs README)            | BUG-005        |
| 5   | A later price change doesn't affect existing order items (unit price snapshot).          | Positive                          | ORD-13         |
| 6   | Client-supplied `unitPriceCents`/`totalCents`/`userId`/`status` are rejected (400).      | Positive                          | ORD-11, ORD-12 |

## Session 3 – Input robustness & type handling (≈ 30 min)

**Charter:** probe validation with wrong types, boundary values and hostile characters.

| #   | Observation                                                                                   | Classification                               | Follow-up                                                                                 |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | `"priceCents":"1500"` accepted as 1500; `description: 42` stored as `"42"`.                   | Contract (implicit conversion is configured) | TYP-01..04. Four first-draft "400 on wrong type" tests were **removed** as wrong oracles. |
| 2   | `"isActive":"false"` stored as **true**.                                                      | **Defect**                                   | BUG-011                                                                                   |
| 3   | `GET /products/%00` → 500. PostgreSQL logs `invalid byte sequence for encoding "UTF8": 0x00`. | **Defect**                                   | BUG-009 (note: the typed clients URL-encode `%`, so the test uses a raw path)             |
| 4   | A body of about 1 MB → 500 instead of 413.                                                    | **Defect**                                   | BUG-008, SEC-08                                                                           |
| 5   | SQL-injection strings round-trip literally; tables are intact.                                | Positive                                     | SEC-03, SEC-04                                                                            |

## Session 4 – Concurrency (≈ 60 min)

**Charter:** check whether invariants survive simultaneous requests. Measure reproduction rates instead of assuming them.
**Tools:** Playwright `--repeat-each=5`, reproduction harness (now `npm run repro:contention`), read-only SQL.

| #   | Observation                                                                                                        | Classification         | Follow-up                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | 12 buyers for 3 units → all 12 accepted, stock −9 (10/10 runs).                                                    | **Defect**             | BUG-002, CON-04                                                                                        |
| 2   | 8 concurrent `PAID` confirmations → 8 × 200. `SHIPPED` and `CANCELLED` both → 200.                                 | **Defect**             | BUG-006, CON-05/06/10                                                                                  |
| 3   | Concurrent duplicate registration → `201, 500, 500, 500, 500`. The DB holds 1 row.                                 | **Defect**             | BUG-013, CON-08/09                                                                                     |
| 4   | Under contention, orders fail after **≈ 5.0–5.3 s** with 500, and **more orders are persisted than acknowledged**. | **Defect** (severe)    | BUG-012, CON-11                                                                                        |
| 5   | A first-draft CON-01 ("10 orders within stock all succeed") was flaky because of #4.                               | Test-design correction | CON-01 rewritten around invariants that hold regardless of timeouts. The defect is tracked separately. |

## Session 5 – Framework self-check (≈ 20 min)

**Charter:** distrust the framework's own failures before blaming the AUT.

| #   | Observation                                                 | Root cause                                                                       | Fix                                                               |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | DB timestamps were 1 h off from the API values.             | node-postgres parses `timestamp without time zone` as _local_ time.              | UTC type parser in `DbClient`                                     |
| 2   | DB-06 found no foreign keys.                                | `information_schema.table_constraints` hides constraints from SELECT-only roles. | The query now uses `pg_catalog`                                   |
| 3   | The full run crashed with `EBUSY: rename … allure-results`. | Windows antivirus locking fresh files on the project drive.                      | Configurable `ALLURE_RESULTS_DIR` (documented in troubleshooting) |
| 4   | The `--reporter=line` CLI flag left a stale JSON report.    | The CLI reporter overrides the configured reporters.                             | Evidence runs use the configured reporters only                   |

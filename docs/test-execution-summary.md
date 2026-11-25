# Test Execution Summary

Every number in this document comes from an actual run on the reference host on **2026-11-24**. Nothing is estimated or hand-edited. You can regenerate it with `npm test && npm run report:summary` (functional) and the k6 commands below (performance).

## Environment

| Item     | Value                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| AUT      | orderflow-api `259c7d0e`, built with `docker/aut.Dockerfile` (Node 22-alpine)                                                  |
| Database | PostgreSQL 16-alpine (Docker), host port 55432                                                                                 |
| Host     | Windows 11 Pro, Docker Desktop 29.9.3, **shared with other running stacks** (Kafka, ERPNext and others)                        |
| Runner   | Node 24.19, Playwright 1.65.1, 4 workers, 0 retries                                                                            |
| k6       | `grafana/k6:1.8.3` container on the same Docker VM as the API, so the load generator and the system under test compete for CPU |

## Functional suite – final evidence run

`npx playwright test` started 2026-11-24T21:55:19Z and took **42.1 s**. A run at 21:42:41Z gave identical results in 28.2 s; duration varies with host load.

| Metric                                         | Value                                                                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total test cases                               | **227** (21 spec files)                                                                                                                                                    |
| Passed                                         | **212**                                                                                                                                                                    |
| Known-defect reproductions, failed as expected | **14**                                                                                                                                                                     |
| Unexpected failures                            | **0**                                                                                                                                                                      |
| Flaky (passed only on retry)                   | **0** (retries were disabled)                                                                                                                                              |
| Skipped                                        | **1**: CON-11, whose precondition (a 5 s transaction timeout) wasn't reached in this run                                                                                   |
| Pass rate (passed ÷ non-defect executed tests) | **100 %**                                                                                                                                                                  |
| Defects evidenced in this run                  | BUG-001, 002, 003, 004, 005, 006, 008, 009, 010, 011, 013, SEC-F01. BUG-012 was evidenced in earlier runs (see its report); BUG-007 is evidenced by the environment build. |

### By area

| Area                       | Tests | Passed | Known-defect | Skipped |
| -------------------------- | ----: | -----: | -----------: | ------: |
| authentication             |    36 |     36 |            0 |       0 |
| authorization              |    23 |     23 |            0 |       0 |
| concurrency                |    11 |      5 |            5 |       1 |
| contract                   |    13 |     13 |            0 |       0 |
| database                   |    12 |     12 |            0 |       0 |
| integration                |     8 |      8 |            0 |       0 |
| negative                   |    17 |     17 |            0 |       0 |
| orders                     |    41 |     41 |            0 |       0 |
| products                   |    38 |     38 |            0 |       0 |
| regression (known defects) |     8 |      0 |            8 |       0 |
| security                   |    15 |     14 |            1 |       0 |
| smoke                      |     5 |      5 |            0 |       0 |

The per-tag breakdown and the generated version of this table are in `reports/summary.md` (CI step summary).

### Stability evidence

| Check                               | Result                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full-suite run history (in order)   | #1: 13 unexpected failures (framework defects and wrong oracles, all triaged) · #2: 0 · #3: aborted by a Windows `EBUSY` lock on allure-results (environment) · #4: 1 (CON-01, BUG-012 timeouts) · #5: 1 (CON-01 again, even with 5 buyers) · CON-01 redesigned around timeout-independent invariants · #6: 0 · #7 (final evidence run): 0 |
| `tests/concurrency --repeat-each=5` | Deterministic tests passed 5/5. The CON-04/05/06/09/10 defect reproductions failed as expected 5/5. CON-11 reproduced 2/5 and skipped 3/5. 0 unexpected results.                                                                                                                                                                           |
| CON-01 rewrite `--repeat-each=3`    | 3/3                                                                                                                                                                                                                                                                                                                                        |

## Coverage

| Dimension                            | Value                                                                                       | Source                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Requirements with ≥ 1 automated test | **23 / 23** Playwright-covered requirements, plus 2 verified by k6 and environment evidence | [RTM](requirements-traceability-matrix.md) |
| Endpoint coverage                    | **13 / 13** OpenAPI operations                                                              | OAS-01                                     |
| Code coverage                        | **Not measured.** The AUT is not instrumented.                                              | –                                          |

## Postman / Newman

`npm run test:postman`: **27 requests, 65 assertions, 0 failures**, 4.8 s, average response 93 ms. The HTML report is `reports/newman/newman-report.html`.

## Performance (k6)

Proposed thresholds: read p95 < 500 ms · write p95 < 1,000 ms · auth p95 < 1,000 ms · HTTP errors < 1 % · checks > 99 % · failed business transactions < 1 %.

| Profile | VUs / duration    | Requests (req/s) |     Read p95 |    Write p95 |     Auth p95 | HTTP errors |            Failed orders | Thresholds                      |
| ------- | ----------------- | ---------------: | -----------: | -----------: | -----------: | ----------: | -----------------------: | ------------------------------- |
| Smoke   | 2 / 30 s          |     1,744 (56/s) |         5 ms | **1,277 ms** |        51 ms |      0.00 % |                  0 / 140 | ❌ write p95                    |
| Load    | 0→20→0 / 4.5 min  |   33,219 (123/s) |        74 ms | **5,184 ms** |        73 ms |      0.46 % |  **154 / 2,676 (5.8 %)** | ❌ write p95, business failures |
| Stress  | 0→150→0 / 5 min   |   34,616 (113/s) | **2,085 ms** | **7,675 ms** | **2,197 ms** |      0.96 % | **332 / 2,757 (12.0 %)** | ❌ all except HTTP errors       |
| Spike   | 5→100→5 / 2.5 min |    11,824 (79/s) | **2,425 ms** | **8,143 ms** | **2,567 ms** |  **1.43 %** |   **169 / 974 (17.4 %)** | ❌ all                          |

**Interpretation:**

1. **Order creation is the bottleneck at every load level.** Even at 2 VUs, p95 exceeds 1 s. Reads stay fast until about 20 VUs.
2. **Failed checkouts grow with concurrency** (0 % → 5.8 % → 12 % → 17 %), with maximum latencies of about 22–24 s. This matches BUG-012: all virtual users buy the same three reference products, so order transactions queue on three hot rows, exceed the interactive-transaction timeout, and fail with 500.
3. Throughput saturates around **110–125 req/s**. Adding VUs beyond 20 increases latency without increasing throughput.
4. Because the load generator runs on the same VM as the API on a shared host, absolute numbers are indicative. The _trends_, and the correlation with BUG-012, are the meaningful result.

These are genuine threshold failures. The thresholds were **not** relaxed to produce a green result. In CI, `performance-tests.yml` would fail the job for the same reason (k6 exit code 99).

## Defects

13 verified defects (5 High, 3 Medium, 5 Low) and 2 security findings (Medium, Low). See the [bug reports](bug-reports/README.md).

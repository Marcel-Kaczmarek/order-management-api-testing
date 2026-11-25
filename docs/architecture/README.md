# Architecture

## System context

```mermaid
flowchart LR
  subgraph Runner["QA framework (this repo, host)"]
    PW["Playwright Test<br/>APIRequestContext"]
    NM["Newman<br/>(Postman collection)"]
    K6["k6<br/>(local binary or grafana/k6 image)"]
  end
  subgraph Compose["Docker Compose: orderflow-qa (local only)"]
    API["OrderFlow API<br/>NestJS 11 · :3000<br/>(AUT @ 259c7d0e)"]
    DB[("PostgreSQL 16<br/>:55432 → 5432")]
  end
  PW -- "REST /api/* (JSON, JWT)" --> API
  NM -- REST --> API
  K6 -- REST --> API
  API -- "Prisma (owner role)" --> DB
  PW -- "pg, qa_readonly role<br/>SELECT only, read-only txn" --> DB
```

The AUT is the only writer to the database. The framework creates data **through the API only** and reads PostgreSQL with a least-privilege role to verify outcomes. Test DB-12 proves that this role can't write.

## Framework layers

```mermaid
flowchart TB
  T["tests/**  (specs: arrange · act · assert)"] --> F["src/fixtures<br/>sessions · data · cleanup · diagnostics"]
  T --> A["src/assertions<br/>toHaveStatus · toMatchSchema · toBeApiError<br/>business invariants (totals, inventory)"]
  F --> C["src/clients  (Service Object Model)<br/>Auth · User · Product · Inventory · Order"]
  F --> D["src/database<br/>DbClient (pool, UTC parser) · OrderRepository (parameterized SQL)"]
  F --> FA["src/factories<br/>seeded Faker · boundary & invalid datasets"]
  C --> B["BaseApiClient<br/>auth header · JSON · timing · HttpRecorder"]
  A --> S["src/schemas<br/>JSON Schema 2020-12 + Ajv"]
  B --> U["src/utilities<br/>sanitizer · logger · polling · jwt · concurrency"]
  CFG["src/config/env.ts<br/>Zod-validated env + local-host guard"] -.-> B & D & F
```

| Layer      | Responsibility                                                                                 | Does **not**                                       |
| ---------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Clients    | Build requests, attach the bearer token, parse JSON, time requests, record sanitized exchanges | Assert anything                                    |
| Fixtures   | Authenticate actors, create and clean up data, attach diagnostics on failure                   | Contain test logic                                 |
| Assertions | Encode the oracles (status, schema, envelope, invariants) with diagnostic messages             | Call the API, except for invariant reads           |
| Repository | Read-only parameterized SQL for verification                                                   | Write data                                         |
| Tests      | Describe behaviour in business language                                                        | Build URLs or JSON by hand (except protocol tests) |

## Key design decisions

| Decision                                           | Rationale                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Vendor the AUT unmodified, pinned to a commit      | Reproducible runs, and findings stay valid for a known version                                       |
| Separate QA Dockerfile (same build stages)         | The upstream image can't start (BUG-007), and its runner stage is very slow on Docker Desktop        |
| `test.fail()` for verified defects                 | The build stays green without hiding defects. A fix triggers an "unexpected pass" and forces cleanup |
| Strict schemas (`additionalProperties: false`)     | Catches excessive data exposure and contract drift                                                   |
| Read-only DB role                                  | Validation can't corrupt state, even by mistake                                                      |
| Tags, not folders, select suites                   | One test can belong to several slices (for example `@security` + `@database`)                        |
| Sanitized HTTP exchange attachments, traces opt-in | Reports are CI artifacts, and Playwright traces contain raw bearer tokens                            |
| Relative assertions on shared collections          | `fullyParallel` safety: no test depends on global counts                                             |
| Measured reproduction rates for races              | Timing-dependent defects are reported with evidence, not assumed                                     |

## CI/CD pipeline

```mermaid
flowchart LR
  subgraph PR["Pull request / push"]
    direction LR
    CI["ci.yml<br/>ESLint · Prettier · tsc<br/>Postman drift · compose config"]
    AT["api-tests.yml"]
  end
  AT --> I[npm ci] --> L[lint + typecheck] --> UP["docker compose up --wait"] --> HS["health-check + seed"] --> SM["@smoke gate"] --> FN["functional run<br/>(all except @concurrency)"] --> RP["HTML · Allure · JUnit · summary"] --> AR[artifacts] --> DN[compose down -v]
  N["nightly-regression.yml (02:00 UTC)"] --> FULL["full suite incl. @concurrency"] --> NW[Newman] --> AR2[artifacts]
  P["performance-tests.yml (manual)"] --> K["k6 profile + thresholds"] --> AR3[summary + JSON]
```

## Business workflow under test

```mermaid
stateDiagram-v2
  [*] --> PENDING: POST /orders\n(stock decremented)
  PENDING --> PAID: simulated payment (admin)
  PENDING --> CANCELLED: admin
  PAID --> SHIPPED: admin
  PAID --> CANCELLED: admin
  SHIPPED --> DELIVERED: admin
  DELIVERED --> [*]
  CANCELLED --> [*]
  note right of CANCELLED: BUG-003 – stock not restored
  note left of PAID: BUG-006 – concurrent duplicate\ntransitions all acknowledged
```

# Application Under Test – upstream attribution

This directory holds an **unmodified snapshot** of a third-party open-source application. It is the *system under test*, not part of the QA framework.

| | |
| --- | --- |
| Project | OrderFlow API |
| Upstream | https://github.com/andriiops/orderflow-api |
| Pinned commit | `259c7d0e23d631eddc4530605d987f63ecdb462a` (branch `main`, pushed 2026-08-10) |
| License | MIT – see [LICENSE](LICENSE) (© 2026 OrderFlow API Contributors) |
| Stack | NestJS 11, Prisma 6, PostgreSQL 16, Passport JWT, bcrypt, Swagger |

## Why it is vendored instead of a git submodule

- **Reproducibility:** the exact code under test is part of every checkout and CI run, with no network fetch of the AUT at test time.
- **Integrity of findings:** defects in `docs/bug-reports/` reference line numbers in this exact snapshot.

No file in this directory was changed. The QA environment builds it with [`../docker/aut.Dockerfile`](../docker/aut.Dockerfile). Its `deps` and `build` stages are identical to the upstream [`Dockerfile`](Dockerfile), and only the final packaging stage differs, for build speed (see that file's header). The upstream `docker-compose.yml` and `.github/workflows/ci.yml` are kept for reference and are **not** used by this repository. GitHub only runs workflows from the repository root.

## Selection rationale (summary)

Two candidates were inspected at source level:

| Criterion | andriiops/orderflow-api | exralvio/nestjs-order-api |
| --- | --- | --- |
| License | MIT ✅ | `"license": "UNLICENSED"`, no LICENSE file ❌ – may not be redistributed |
| Local setup | Postgres + API, migrations and seed on start | Postgres + Redis + RabbitMQ + per-tenant DB provisioning by an async consumer |
| Business workflow | Register → order → PAID → SHIPPED → DELIVERED / CANCELLED, stock decrement | Multi-tenant orders, payment-link stub, async completion |
| Testability | Deterministic, synchronous, single DB | Eventual consistency across tenant databases |

The decisive factor was licensing: a public portfolio can't redistribute an UNLICENSED codebase. OrderFlow also offers a reproducible, testable order lifecycle. Its trade-off is that it has no Redis or RabbitMQ, so messaging and cache tests are out of scope rather than simulated. See `docs/test-strategy.md` §4.

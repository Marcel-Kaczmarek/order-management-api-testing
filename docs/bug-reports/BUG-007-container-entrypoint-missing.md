# BUG-007 – Docker image cannot start: `dist/main.js` does not exist

| Field               | Value                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Bug ID              | BUG-007                                                                                                     |
| Component           | Build and packaging (`Dockerfile`, `package.json` `start:prod`)                                             |
| Application version | orderflow-api `259c7d0e`                                                                                    |
| Severity            | **High** – the documented quick start (`docker compose up --build`, upstream acceptance criterion #1) fails |
| Priority            | **P1**                                                                                                      |
| Reproduction rate   | 100 %                                                                                                       |
| Status              | Open – worked around in this repository (`docker/aut.Dockerfile`)                                           |

## Steps to reproduce

1. Build the image with the upstream build stages (`npm ci`, `prisma generate`, `npm run build`).
2. Start the container. Its command is `npx prisma migrate deploy && npx prisma db seed && node dist/main.js`.

## Expected result

The API listens on port 3000.

## Actual result

Migration and seeding succeed, then Node exits with code 1:

```text
🌱  The seed command has been executed.
Error: Cannot find module '/app/dist/main.js'
    code: 'MODULE_NOT_FOUND'
container orderflow-qa-api-1 exited (1)
```

Inspecting the image (`find dist -name main.js`) prints **`dist/src/main.js`**.

## Root cause (verified)

`tsconfig.json` has no `rootDir` or `include`, so `nest build` also compiles `prisma/seed.ts`. TypeScript then computes the project root as the common source root and emits `dist/src/**` and `dist/prisma/**`. Both `Dockerfile` line 28 and `package.json` `start:prod` (line 14) still reference `dist/main.js`.

Verification: the image was built with build stages identical to the upstream Dockerfile, and the dist layout was inspected inside it. The upstream runner stage copies the same `dist/` folder.

## Business impact

New contributors and deployments can't start the service from the documented instructions. Upstream CI doesn't catch it, because it runs only unit tests and never starts the image.

## Suggested remediation

Set `"rootDir": "./src"` in a `tsconfig.build.json` that excludes `prisma/`, or change the entrypoint to `dist/src/main.js`. Add a container smoke test to CI, such as `docker compose up --wait` followed by a health request.

## Workaround in this repository

`docker/aut.Dockerfile` starts `node dist/src/main.js`. The AUT source is unchanged.

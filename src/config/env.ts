import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'api']);

const envSchema = z
  .object({
    TEST_ENV: z.enum(['local', 'ci']).default('local'),
    API_BASE_URL: z.url().default('http://localhost:3000'),
    JWT_SECRET: z.string().min(16).default('local-qa-jwt-secret-not-for-production'),
    ADMIN_EMAIL: z.email().default('admin@orderflow.dev'),
    ADMIN_PASSWORD: z.string().min(8).default('Admin123!'),
    SEED_CUSTOMER_EMAIL: z.email().default('customer@orderflow.dev'),
    SEED_CUSTOMER_PASSWORD: z.string().min(8).default('Customer123!'),
    DB_HOST: z.string().min(1).default('localhost'),
    DB_PORT: z.coerce.number().int().positive().default(55432),
    POSTGRES_DB: z.string().min(1).default('orderflow'),
    DB_READONLY_USER: z.string().min(1).default('qa_readonly'),
    DB_READONLY_PASSWORD: z.string().min(1).default('qa_readonly'),
    TEST_WORKERS: z.coerce.number().int().positive().default(4),
    TEST_RETRIES: z.coerce.number().int().min(0).max(3).default(0),
    TEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    FAKER_SEED: z.coerce.number().int().default(20261124),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((value, ctx) => {
    // Safety guard: the suite performs writes and security probes, so it must
    // only ever target a locally controlled environment.
    for (const [key, host] of [
      ['API_BASE_URL', new URL(value.API_BASE_URL).hostname],
      ['DB_HOST', value.DB_HOST],
    ] as const) {
      if (!LOCAL_HOSTS.has(host)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `Refusing to run against non-local host "${host}". Only local environments are authorized.`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid test environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();

/** API root including the AUT's global `/api` prefix. */
export const apiRoot = `${env.API_BASE_URL.replace(/\/$/, '')}/api/`;

import { Pool, types, type QueryResultRow } from 'pg';
import { env } from '@src/config/env';

// Prisma stores DateTime as `timestamp(3) WITHOUT time zone` holding UTC values.
// node-postgres would interpret those as *local* time, shifting every timestamp
// by the runner's UTC offset. Parse them explicitly as UTC.
const TIMESTAMP_WITHOUT_TZ_OID = 1114;
types.setTypeParser(TIMESTAMP_WITHOUT_TZ_OID, (value) => new Date(`${value.replace(' ', 'T')}Z`));

/**
 * PostgreSQL access for *validation only*.
 *
 * - Connects as the least-privilege `qa_readonly` role (SELECT only, and
 *   `default_transaction_read_only = on`), so the suite cannot mutate data
 *   even by accident.
 * - Every query is parameterized – no string interpolation of values.
 */
export class DbClient {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.POSTGRES_DB,
      user: env.DB_READONLY_USER,
      password: env.DB_READONLY_PASSWORD,
      max: 4,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'qa-framework',
    });
  }

  async query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(text, values);
    return result.rows;
  }

  async one<T extends QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<T | undefined> {
    const rows = await this.query<T>(text, values);
    return rows[0];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

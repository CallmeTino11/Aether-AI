/**
 * Aether AI — Infrastructure: node-postgres SqlExecutor
 *
 * The only file in the codebase that imports the database driver.
 */

import { Pool, type PoolClient } from "pg";

import type { SqlExecutor } from "./sql-executor.js";

/** Wraps a single checked-out client so a transaction's statements share it. */
class ClientExecutor implements SqlExecutor {
  constructor(private readonly client: PoolClient) {}

  async query<TRow>(sql: string, params: readonly unknown[] = []): Promise<readonly TRow[]> {
    const result = await this.client.query(sql, [...params]);
    return result.rows as TRow[];
  }

  // Nested transactions would need savepoints; a turn does not need them, so
  // this deliberately reuses the existing transaction rather than pretending
  // to open a second one.
  async transaction<TResult>(work: (tx: SqlExecutor) => Promise<TResult>): Promise<TResult> {
    return work(this);
  }
}

export class PgSqlExecutor implements SqlExecutor {
  constructor(private readonly pool: Pool) {}

  static fromConnectionString(connectionString: string): PgSqlExecutor {
    return new PgSqlExecutor(new Pool({ connectionString }));
  }

  async query<TRow>(sql: string, params: readonly unknown[] = []): Promise<readonly TRow[]> {
    const result = await this.pool.query(sql, [...params]);
    return result.rows as TRow[];
  }

  async transaction<TResult>(work: (tx: SqlExecutor) => Promise<TResult>): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(new ClientExecutor(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

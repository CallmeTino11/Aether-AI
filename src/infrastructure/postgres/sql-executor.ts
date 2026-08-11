/**
 * Aether AI — Infrastructure: SQL Executor
 *
 * Thin seam over the database driver. Repositories depend on this interface
 * rather than importing `pg` directly, for two reasons: the driver stays
 * replaceable (Supabase client, connection pooler, serverless driver), and
 * repositories become testable with a recording fake.
 */

export interface SqlExecutor {
  query<TRow>(sql: string, params?: readonly unknown[]): Promise<readonly TRow[]>;
  /**
   * Runs `work` inside a transaction, rolling back if it throws.
   * A turn writes several rows (messages + conversation state) that must land
   * together — a reply persisted without its state change would be corruption.
   */
  transaction<TResult>(work: (tx: SqlExecutor) => Promise<TResult>): Promise<TResult>;
}

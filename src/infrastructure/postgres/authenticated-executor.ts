/**
 * Aether AI — Infrastructure: Authenticated (RLS-scoped) SQL Executor
 *
 * The dashboard is the first surface where a real user is logged in, which
 * makes it the first place Row Level Security can actually do its job. The
 * widget path runs as the service role with RLS bypassed and the application
 * as the sole boundary (DEC-0007/DEC-0012); the dashboard is the opposite —
 * queries run *as the user*, and Postgres enforces tenancy.
 *
 * That only works if the user's identity is set correctly on every query, and
 * the failure modes here are subtle enough to be worth spelling out. Both were
 * confirmed empirically against Postgres 16 rather than assumed:
 *
 * 1. SESSION-LEVEL `set_config(..., false)` PERSISTS AFTER COMMIT.
 *    With a connection pool, the next request to borrow that connection
 *    inherits the previous user's identity. Two users, one connection, and
 *    user B silently reads user A's business. Verified: after committing a
 *    session-level set, a fresh statement still returned the old subject.
 *
 * 2. TRANSACTION-LOCAL `set_config(..., true)` REVERTS TO THE SESSION VALUE,
 *    NOT TO NULL.
 *    So "clearing" the identity restores whatever was last set at session
 *    level — a stale identity rather than no identity. Verified the same way.
 *
 * Therefore: this executor NEVER sets session-level configuration, and every
 * authenticated statement runs inside a transaction with a transaction-local
 * setting. Outside a transaction there is no identity, so RLS denies
 * everything — failing closed, which is the correct direction to fail.
 */

import type { PoolClient } from "pg";
import { Pool } from "pg";

import type { SqlExecutor } from "./sql-executor.js";

/** Postgres GUC that Supabase's RLS policies read via `auth.uid()`. */
const JWT_SUBJECT_SETTING = "request.jwt.claim.sub";

/**
 * Role that authenticated dashboard queries assume. It must NOT be the table
 * owner or a superuser: Postgres exempts both from RLS, so running as the
 * owner would silently disable every policy while appearing to work.
 */
const AUTHENTICATED_ROLE = "app_user";

class TransactionScopedExecutor implements SqlExecutor {
  constructor(private readonly client: PoolClient) {}

  async query<TRow>(sql: string, params: readonly unknown[] = []): Promise<readonly TRow[]> {
    const result = await this.client.query(sql, [...params]);
    return result.rows as TRow[];
  }

  async transaction<TResult>(work: (tx: SqlExecutor) => Promise<TResult>): Promise<TResult> {
    // Already inside one; nesting would need savepoints and nothing needs them.
    return work(this);
  }
}

export class AuthenticatedSqlExecutor implements SqlExecutor {
  constructor(
    private readonly pool: Pool,
    private readonly userId: string,
    private readonly role: string = AUTHENTICATED_ROLE,
  ) {
    if (!userId) {
      // An empty subject would make auth.uid() null and, depending on policy
      // shape, could widen rather than restrict access. Refuse to construct.
      throw new Error("AuthenticatedSqlExecutor requires a user id.");
    }
  }

  static fromConnectionString(connectionString: string, userId: string): AuthenticatedSqlExecutor {
    return new AuthenticatedSqlExecutor(new Pool({ connectionString }), userId);
  }

  /**
   * Every statement goes through a transaction so the identity is
   * transaction-local. A bare query outside a transaction would either leak
   * across pooled connections or run with no identity at all.
   */
  async query<TRow>(sql: string, params: readonly unknown[] = []): Promise<readonly TRow[]> {
    return this.transaction((tx) => tx.query<TRow>(sql, params));
  }

  async transaction<TResult>(work: (tx: SqlExecutor) => Promise<TResult>): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      // `true` = transaction-local. Parameterised, so a hostile user id cannot
      // inject SQL into the identity itself.
      await client.query("select set_config($1, $2, true)", [JWT_SUBJECT_SETTING, this.userId]);
      // `set local role` is likewise reverted at commit or rollback.
      await client.query(`set local role ${quoteIdentifier(this.role)}`);

      const result = await work(new TransactionScopedExecutor(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {
        /* rollback failure must not mask the original error */
      });
      throw error;
    } finally {
      // Belt and braces: even though `set local` reverts automatically, an
      // explicit reset means a connection can never return to the pool wearing
      // a previous request's identity.
      await client.query("reset role").catch(() => {});
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Role names cannot be parameterised in `set role`, so the identifier is
 * quoted and validated instead. The allowlist-style check rejects anything
 * that is not a plain identifier.
 */
function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe role identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

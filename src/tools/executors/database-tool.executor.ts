import { createHash } from 'node:crypto';

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool as PgPool } from 'pg';
import mysql, { Pool as MysqlPool } from 'mysql2/promise';

import { capRows, MAX_RESPONSE_BYTES } from './response-limits';
import { assertSelectOnly } from './sql-guard';
import { ToolExecutionResult, ToolExecutor } from './tool-executor.interface';

interface DatabaseToolConfig {
  engine: 'postgres' | 'mysql';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  query: string;
}

const CONNECT_TIMEOUT_MS = 5_000;
const QUERY_TIMEOUT_MS = 10_000;
const MAX_ROWS = 500;
const POOL_IDLE_MS = 30_000;

interface CachedPool {
  pool: PgPool | MysqlPool;
  idleTimer: NodeJS.Timeout;
}

// Tokenizes a query template's named placeholders (":paramName") into the
// engine's positional placeholder syntax, binding every occurrence as a real
// query parameter. Args can only ever fill placeholder VALUES, never
// identifiers — this is what makes SQL injection via args structurally
// impossible regardless of what an arg's value contains.
function bindNamedParams(
  query: string,
  args: Record<string, unknown>,
  placeholder: (occurrence: number) => string,
): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  let occurrence = 0;

  const text = query.replace(
    /:([a-zA-Z_][a-zA-Z0-9_]*)/g,
    (_match, name: string) => {
      occurrence += 1;
      values.push(args[name] ?? null);
      return placeholder(occurrence);
    },
  );

  return { text, values };
}

@Injectable()
export class DatabaseToolExecutor implements ToolExecutor, OnModuleDestroy {
  private readonly pools = new Map<string, CachedPool>();

  async execute(
    rawConfig: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    // Trusted to match {Postgres,Mysql}DatabaseToolConfigDto's shape — config
    // is only ever written through validateToolConfig's validation.
    const config = rawConfig as unknown as DatabaseToolConfig;

    try {
      // Defense-in-depth: re-checked here even though validateToolConfig
      // already enforced this at authoring time, in case a row predates a
      // guard tightening.
      assertSelectOnly(config.query);

      const rows =
        config.engine === 'postgres'
          ? await this.queryPostgres(config, args)
          : await this.queryMysql(config, args);

      const { rows: body, truncated } = capRows(
        rows,
        MAX_ROWS,
        MAX_RESPONSE_BYTES,
      );

      return { ok: true, status: 200, body, truncated };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: {
          error:
            error instanceof Error ? error.message : 'Database query failed',
        },
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const [key, cached] of this.pools) {
      clearTimeout(cached.idleTimer);
      this.pools.delete(key);
      await cached.pool.end();
    }
  }

  private async queryPostgres(
    config: DatabaseToolConfig,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const { text, values } = bindNamedParams(
      config.query,
      args,
      (occurrence) => `$${occurrence}`,
    );

    const pool = this.getPool(config, () => this.createPostgresPool(config));
    const result = await (pool as PgPool).query(text, values);

    return result.rows as Record<string, unknown>[];
  }

  private async queryMysql(
    config: DatabaseToolConfig,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    // execute() (real server-side prepared statements) is used deliberately
    // over query() for the prepared-statement caching benefit, since query
    // templates are stable per tool. Caveat: unlike query()'s client-side
    // interpolation, execute() does not expand an array-valued arg into
    // IN (?,?,?) — array args are not supported for MySQL IN (:list)
    // templates in this pass (accepted limitation; Postgres can do the
    // equivalent safely via = ANY($n)).
    const { text, values } = bindNamedParams(config.query, args, () => '?');

    const pool = this.getPool(config, () => this.createMysqlPool(config));
    // values are JSON-compatible primitives from parsed tool-call args —
    // mysql2's ExecuteValues type is narrower than `unknown`, so this cast
    // is safe in practice even though it isn't statically verifiable here.
    const [rows] = await (pool as MysqlPool).execute(
      { sql: text, timeout: QUERY_TIMEOUT_MS },
      values as any[],
    );

    return rows as Record<string, unknown>[];
  }

  private getPool(
    config: DatabaseToolConfig,
    create: () => PgPool | MysqlPool,
  ): PgPool | MysqlPool {
    const key = this.cacheKey(config);
    const cached = this.pools.get(key);

    if (cached) {
      this.rescheduleIdleClose(key, cached);
      return cached.pool;
    }

    const pool = create();
    const idleTimer = this.scheduleIdleClose(key, pool);
    this.pools.set(key, { pool, idleTimer });
    return pool;
  }

  private createPostgresPool(config: DatabaseToolConfig): PgPool {
    return new PgPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      max: 2,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: QUERY_TIMEOUT_MS,
      idleTimeoutMillis: POOL_IDLE_MS,
    });
  }

  private createMysqlPool(config: DatabaseToolConfig): MysqlPool {
    return mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: 2,
      connectTimeout: CONNECT_TIMEOUT_MS,
    });
  }

  private scheduleIdleClose(
    key: string,
    pool: PgPool | MysqlPool,
  ): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.pools.delete(key);
      void pool.end();
    }, POOL_IDLE_MS);
    timer.unref();
    return timer;
  }

  private rescheduleIdleClose(key: string, cached: CachedPool): void {
    clearTimeout(cached.idleTimer);
    cached.idleTimer = this.scheduleIdleClose(key, cached.pool);
  }

  // Hash of the FULL config (including password) — not just
  // engine+host+port+database+user — so a credential-only rotation via
  // PATCH /tools/:id gets a fresh pool instead of silently reusing a cached
  // pool with the old password until it happens to idle out.
  private cacheKey(config: DatabaseToolConfig): string {
    return createHash('sha256').update(JSON.stringify(config)).digest('hex');
  }
}

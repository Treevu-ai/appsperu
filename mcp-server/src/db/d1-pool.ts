import type { D1Database } from "@cloudflare/workers-types";

export interface D1Row {
  [key: string]: unknown;
}

export interface QueryResult<T extends D1Row = D1Row> {
  rows: T[];
  meta?: unknown;
}

export class D1Pool {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async query<T extends D1Row = D1Row>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const stmt = this.db.prepare(sql);
    const bound = params ? stmt.bind(...params) : stmt;
    const result = await bound.all<T>();
    return {
      rows: result.results ?? [],
      meta: result.meta,
    };
  }

  async queryRow<T extends D1Row = D1Row>(sql: string, params?: unknown[]): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const bound = params ? stmt.bind(...params) : stmt;
    const result = await bound.first<T>();
    return result ?? null;
  }

  async execute(sql: string, params?: unknown[]): Promise<D1Result> {
    const stmt = this.db.prepare(sql);
    const bound = params ? stmt.bind(...params) : stmt;
    return bound.run();
  }
}

export interface D1Result {
  success: boolean;
  meta: Record<string, unknown>;
  results?: unknown[];
}

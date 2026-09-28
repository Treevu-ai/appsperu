import { Client } from "@neondatabase/serverless";

export interface NeonRow {
  [key: string]: unknown;
}

export interface QueryResult<T extends NeonRow = NeonRow> {
  rows: T[];
  rowCount: number;
}

export interface ExecuteResult {
  affectedRows: number;
}

/**
 * Cliente Postgres para el MCP Worker, sobre `@neondatabase/serverless`.
 *
 * Expone la misma superficie que usaban los handlers (`query` / `queryRow` /
 * `execute`) para que el SQL se escriba tal cual está en
 * `apps/<app>/api/src/routes/*.ts`: placeholders `$1, $2`, `DISTINCT ON`,
 * `ILIKE`, casts `::`, `ARRAY_AGG`. No hay traducción de dialecto — es
 * Postgres 17 real. Ver docs/adr/0024-neon-en-lugar-de-d1.md.
 *
 * Por qué `Client` (WebSocket) y no el transporte HTTP de Neon: `Client` es
 * un drop-in de node-postgres y conserva la firma `{ rows }`, que es la que
 * espera todo el código de handlers y auth. El modo HTTP de Neon es más
 * rápido para queries sueltas pero no expone la misma interfaz.
 *
 * Por qué un cliente por query y no un pool reutilizable: en Cloudflare
 * Workers una conexión WebSocket no sobrevive a la invocación que la abrió.
 * El pool de Neon existe para runtimes donde eso sí se cumple. Como el
 * volumen de Rastro es manual y de decenas de queries diarias, el costo de
 * establecer una conexión por query es irrelevante frente a la latencia
 * total percibida.
 */
export class NeonPool {
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async query<T extends NeonRow = NeonRow>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const client = new Client(this.connectionString);
    try {
      await client.connect();
      const result = await client.query(sql, params);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
    } finally {
      await client.end();
    }
  }

  async queryRow<T extends NeonRow = NeonRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const result = await this.query<T>(sql, params);
    return result.rows[0] ?? null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const client = new Client(this.connectionString);
    try {
      await client.connect();
      const result = await client.query(sql, params);
      return { affectedRows: result.rowCount ?? 0 };
    } finally {
      await client.end();
    }
  }
}

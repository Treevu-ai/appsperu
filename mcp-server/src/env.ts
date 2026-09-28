import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  MCP_DB: D1Database;
  [key: string]: D1Database | unknown;
}

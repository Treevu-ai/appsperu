/**
 * Tipos mínimos para Cloudflare Pages Functions, escritos a mano en vez de
 * depender de `@cloudflare/workers-types` (evita agregar una dependencia
 * nueva solo para 2 endpoints). Cubre exactamente lo que usan
 * `functions/api/search.ts`, `functions/api/rate-limit-stats.ts` y
 * `functions/lib/rate-limit.ts`.
 */

interface KVNamespacePutOptions {
  expirationTtl?: number;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
}

interface PagesEnv {
  RATE_LIMIT: KVNamespace;
}

interface PagesEventContext<Env = PagesEnv> {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil(promise: Promise<unknown>): void;
}

type PagesFunctionHandler<Env = PagesEnv> = (context: PagesEventContext<Env>) => Response | Promise<Response>;

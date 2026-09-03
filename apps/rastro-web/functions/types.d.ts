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
  /**
   * Cloudflare Access Service Token — Client ID.
   * Header saliente: `CF-Access-Client-Id`.
   * Solo presente en producción (Cloudflare Pages → Settings → Environment
   * variables). Ver `docs/API_ACCESS_PROTECTION.md` para crear el Service
   * Token en Cloudflare Access. Opcional en dev: si está ausente, la
   * Function sigue funcionando contra `localhost` o cae al `search-index`
   * bundleado.
   */
  CF_ACCESS_CLIENT_ID?: string;
  /**
   * Cloudflare Access Service Token — Client Secret.
   * Header saliente: `CF-Access-Client-Secret`. Mismo origen y caveat
   * que `CF_ACCESS_CLIENT_ID`.
   */
  CF_ACCESS_CLIENT_SECRET?: string;
}

interface PagesEventContext<Env = PagesEnv> {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil(promise: Promise<unknown>): void;
}

type PagesFunctionHandler<Env = PagesEnv> = (context: PagesEventContext<Env>) => Response | Promise<Response>;

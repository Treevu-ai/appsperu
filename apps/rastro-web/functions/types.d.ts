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

interface KVNamespaceListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

interface KVNamespaceListResult {
  keys: { name: string; expiration?: number }[];
  list_complete: boolean;
  cursor?: string;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult>;
}

interface PagesEnv {
  RATE_LIMIT: KVNamespace;
  /**
   * Solicitudes de acceso a `sk-rastro-*` (formulario /solicitar-acceso).
   * Cada registro trae PII real (nombre, correo, teléfono, motivo) — se
   * guarda con expirationTtl de 90 días (ver RETENTION_DIAS en
   * functions/api/solicitud-acceso.ts), no indefinidamente. Un admin las
   * revisa a mano con `wrangler kv key list --binding=ACCESS_REQUESTS` /
   * `wrangler kv key get <key> --binding=ACCESS_REQUESTS`, mismo flujo
   * manual que la emisión de keys documentada en docs/FLY_DEPLOY_MCP.md.
   */
  ACCESS_REQUESTS: KVNamespace;
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

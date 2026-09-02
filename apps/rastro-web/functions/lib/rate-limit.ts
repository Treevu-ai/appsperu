/**
 * Rate limit por IP con ventana fija de 60s, sobre Cloudflare KV (AL3-17).
 *
 * Diseño y limitación conocida: KV no ofrece incremento atómico — este
 * helper hace get→put, que bajo ráfagas concurrentes muy altas puede
 * subcontar (dos requests casi simultáneos leen el mismo valor antes de que
 * cualquiera escriba). Es un límite "best effort", suficiente para frenar
 * abuso obvio (scraping, loops de un cliente) sin la complejidad de un
 * Durable Object. Documentado como decisión, no como bug — mismo criterio
 * "V1, se reabre si hay abuso real" del ticket original.
 */

const WINDOW_SECONDS = 60;
const KV_TTL_SECONDS = 90; // > WINDOW_SECONDS para no expirar el conteo antes de tiempo

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

function windowKey(route: string, ip: string, windowStart: number): string {
  return `ratelimit:${route}:${ip}:${windowStart}`;
}

export function currentWindowStart(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / (WINDOW_SECONDS * 1000));
}

/**
 * Consulta y consume una unidad de cupo para (route, ip) en la ventana
 * actual. `kv` es cualquier objeto con la interfaz mínima de KVNamespace
 * (get/put) — permite testear sin runtime de Cloudflare, con un mock en
 * memoria.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  route: string,
  ip: string,
  limit: number,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  const windowStart = currentWindowStart(nowMs);
  const key = windowKey(route, ip, windowStart);
  const raw = await kv.get(key);
  const current = raw === null ? 0 : Number(raw);
  const nextWindowMs = (windowStart + 1) * WINDOW_SECONDS * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((nextWindowMs - nowMs) / 1000));

  if (current >= limit) {
    return { allowed: false, limit, remaining: 0, retryAfterSeconds };
  }

  await kv.put(key, String(current + 1), { expirationTtl: KV_TTL_SECONDS });
  return { allowed: true, limit, remaining: limit - (current + 1), retryAfterSeconds };
}

/**
 * Registra un 429 en el contador horario usado por `/api/rate-limit-stats`
 * (AL3-17: métrica pública `429Count24h` en `/estado`).
 */
export async function recordRateLimitExceeded(kv: KVNamespace, nowMs: number = Date.now()): Promise<void> {
  const hourBucket = new Date(nowMs).toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const key = `ratelimit:429count:${hourBucket}`;
  const raw = await kv.get(key);
  const current = raw === null ? 0 : Number(raw);
  await kv.put(key, String(current + 1), { expirationTtl: 26 * 60 * 60 });
}

/** Suma los 24 buckets horarios más recientes para el conteo de 24h. */
export async function count429Last24h(kv: KVNamespace, nowMs: number = Date.now()): Promise<number> {
  let total = 0;
  for (let i = 0; i < 24; i += 1) {
    const bucketMs = nowMs - i * 60 * 60 * 1000;
    const hourBucket = new Date(bucketMs).toISOString().slice(0, 13);
    const raw = await kv.get(`ratelimit:429count:${hourBucket}`);
    if (raw !== null) total += Number(raw);
  }
  return total;
}

/** Extrae la IP del cliente desde los headers que pone Cloudflare. */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? "unknown";
}

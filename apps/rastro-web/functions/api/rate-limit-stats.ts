/**
 * GET /api/rate-limit-stats (AL3-17) — expone `429Count24h` para la
 * métrica pública que pide el criterio de aceptación en /estado.
 *
 * Rate-limiteado con el mismo mecanismo que /api/search, en su propio bucket
 * de ruta ("rate-limit-stats"): sin esto, `count429Last24h` hace 24 lecturas
 * de KV por request — un endpoint público sin límite propio podía usarse
 * para generar tráfico de KV desproporcionado sin ningún costo para quien
 * lo dispara. El límite es generoso (una página de estado que refresca cada
 * pocos segundos no debería tropezar con esto en uso normal).
 */
import { checkRateLimit, clientIp, count429Last24h } from "../lib/rate-limit.js";

const RATE_LIMIT_PER_MINUTE = 20;

export const onRequestGet: PagesFunctionHandler = async (context) => {
  const ip = clientIp(context.request);
  const rate = await checkRateLimit(context.env.RATE_LIMIT, "rate-limit-stats", ip, RATE_LIMIT_PER_MINUTE);
  if (!rate.allowed) {
    return Response.json(
      { error: "Demasiadas solicitudes." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const count = await count429Last24h(context.env.RATE_LIMIT);
  return Response.json({ count429Last24h: count });
};

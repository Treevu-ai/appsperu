/**
 * GET /api/rate-limit-stats (AL3-17) — expone `429Count24h` para la
 * métrica pública que pide el criterio de aceptación en /estado.
 */
import { count429Last24h } from "../lib/rate-limit.js";

export const onRequestGet: PagesFunctionHandler = async (context) => {
  const count = await count429Last24h(context.env.RATE_LIMIT);
  return Response.json({ count429Last24h: count });
};

/**
 * GET/DELETE /api/admin/solicitudes — Cloudflare Pages Function.
 *
 * Lista (GET) y borra (DELETE ?key=...) las solicitudes de acceso guardadas
 * por functions/api/solicitud-acceso.ts. Contiene PII real (nombre, correo,
 * teléfono, motivo) — protegido por Cloudflare Access en
 * www.rastro.fyi/api/admin/solicitudes (solo acuba0103@gmail.com).
 *
 * El chequeo de `Cf-Access-Authenticated-User-Email` de acá abajo es
 * defensa en profundidad, no la protección principal: Access cubre el
 * dominio `www.rastro.fyi`, pero el mismo deploy también se sirve en el
 * fallback `*.pages.dev` (sin Access) — sin este chequeo, cualquiera que
 * conozca esa URL vería las solicitudes sin login.
 */
const ADMIN_EMAIL = "acuba0103@gmail.com";
const LIST_LIMIT = 100;

interface SolicitudGuardada {
  nombre: string;
  correo: string;
  telefono: string;
  motivo: string;
  ip: string;
  creadoEn: string;
}

function isAdmin(request: Request): boolean {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  return email?.toLowerCase() === ADMIN_EMAIL;
}

export const onRequestGet: PagesFunctionHandler = async (context) => {
  const { request, env } = context;
  if (!isAdmin(request)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }

  const { keys } = await env.ACCESS_REQUESTS.list({ limit: LIST_LIMIT });
  const solicitudes = await Promise.all(
    keys.map(async (k) => {
      const raw = await env.ACCESS_REQUESTS.get(k.name);
      if (!raw) return null;
      const data = JSON.parse(raw) as SolicitudGuardada;
      return { key: k.name, expiraEn: k.expiration ?? null, ...data };
    }),
  );

  const items = solicitudes
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

  return Response.json({ ok: true, total: items.length, items });
};

export const onRequestDelete: PagesFunctionHandler = async (context) => {
  const { request, env } = context;
  if (!isAdmin(request)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key || !key.startsWith("solicitud:")) {
    return Response.json({ ok: false, error: "Falta el parámetro key, o es inválido." }, { status: 400 });
  }

  await env.ACCESS_REQUESTS.delete(key);
  return Response.json({ ok: true });
};

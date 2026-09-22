/**
 * POST /api/solicitud-acceso — Cloudflare Pages Function.
 *
 * Recibe el formulario de /solicitar-acceso (nombre, correo, teléfono,
 * motivo) y lo guarda en KV para revisión manual — no hay emisión
 * automática de `sk-rastro-*`, el mismo flujo manual que ya describe
 * docs/FLY_DEPLOY_MCP.md para las keys existentes. Un admin revisa las
 * solicitudes con:
 *   wrangler kv key list --binding=ACCESS_REQUESTS
 *   wrangler kv key get <key> --binding=ACCESS_REQUESTS
 * y responde por correo al address indicado en el formulario.
 *
 * `campoTrampa` es un honeypot: un input oculto en el form que un humano
 * nunca completa. Si llega con valor, se responde 200 sin persistir nada —
 * no se le da a un bot la señal de "rechazado" que lo haría reintentar con
 * otro patrón (ver rules/ecc/web/security.md: honeypot en vez de CAPTCHA).
 *
 * Política de retención: cada registro trae nombre, correo, teléfono y el
 * motivo tal como los escribió la persona — PII real. Se guarda con
 * `expirationTtl` de RETENTION_DIAS días: Cloudflare KV la borra sola
 * pasado ese plazo, así una solicitud ya atendida (o nunca atendida) no
 * queda viva indefinidamente. Si el equipo necesita conservar el historial
 * de una solicitud ya aprobada más allá de eso, debe copiarlo a su propio
 * registro de keys emitidas — este KV es solo la bandeja de entrada de la
 * solicitud, no el registro de quién tiene una key.
 */
import { checkRateLimit, clientIp } from "../lib/rate-limit.js";

const RATE_LIMIT_PER_MINUTE = 3;
const RETENTION_DIAS = 90;
const RETENTION_SEGUNDOS = RETENTION_DIAS * 24 * 60 * 60;
const NOMBRE_MIN = 3;
const NOMBRE_MAX = 120;
const TELEFONO_MIN = 6;
const TELEFONO_MAX = 20;
const MOTIVO_MIN = 20;
const MOTIVO_MAX = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_RE = /^[\d\s+()-]+$/;
const TELEFONO_DIGITOS_MIN = 6;

interface SolicitudBody {
  nombre?: unknown;
  correo?: unknown;
  telefono?: unknown;
  motivo?: unknown;
  campoTrampa?: unknown;
}

function validar(body: SolicitudBody): string | null {
  const { nombre, correo, telefono, motivo } = body;
  if (typeof nombre !== "string" || nombre.trim().length < NOMBRE_MIN || nombre.trim().length > NOMBRE_MAX) {
    return `El nombre completo debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`;
  }
  if (typeof correo !== "string" || !EMAIL_RE.test(correo.trim())) {
    return "El correo no es válido.";
  }
  if (
    typeof telefono !== "string" ||
    telefono.trim().length < TELEFONO_MIN ||
    telefono.trim().length > TELEFONO_MAX ||
    !TELEFONO_RE.test(telefono.trim()) ||
    (telefono.match(/\d/g)?.length ?? 0) < TELEFONO_DIGITOS_MIN
  ) {
    return "El teléfono no es válido.";
  }
  if (typeof motivo !== "string" || motivo.trim().length < MOTIVO_MIN || motivo.trim().length > MOTIVO_MAX) {
    return `El motivo de la solicitud debe tener entre ${MOTIVO_MIN} y ${MOTIVO_MAX} caracteres.`;
  }
  return null;
}

export const onRequestPost: PagesFunctionHandler = async (context) => {
  const { request, env } = context;

  const ip = clientIp(request);
  const rate = await checkRateLimit(env.RATE_LIMIT, "solicitud-acceso", ip, RATE_LIMIT_PER_MINUTE);
  if (!rate.allowed) {
    return Response.json(
      { ok: false, error: "Demasiadas solicitudes. Intenta de nuevo en unos minutos." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  let body: SolicitudBody;
  try {
    body = (await request.json()) as SolicitudBody;
  } catch {
    return Response.json({ ok: false, error: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }

  if (typeof body.campoTrampa === "string" && body.campoTrampa.trim().length > 0) {
    return Response.json({ ok: true });
  }

  const error = validar(body);
  if (error) {
    return Response.json({ ok: false, error }, { status: 400 });
  }

  const nombre = (body.nombre as string).trim();
  const correo = (body.correo as string).trim();
  const telefono = (body.telefono as string).trim();
  const motivo = (body.motivo as string).trim();
  const creadoEn = new Date().toISOString();
  const key = `solicitud:${Date.now()}:${crypto.randomUUID()}`;

  await env.ACCESS_REQUESTS.put(key, JSON.stringify({ nombre, correo, telefono, motivo, ip, creadoEn }), {
    expirationTtl: RETENTION_SEGUNDOS,
  });

  return Response.json({ ok: true }, { status: 201 });
};

import type { NeonRow } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Copia reducida de `packages/entity-matcher` (match difuso por nombre) —
 * mcp-server no puede consumir paquetes privados del workspace npm raíz
 * (tiene su propio lockfile, no está en `workspaces`). Mantener en sync con
 * `packages/entity-matcher/src/index.ts` si cambia el algoritmo.
 */
type MatchConfidence = "confirmada" | "candidata";
const STOPWORDS = new Set(["DE", "LA", "LIBERTAD", "DEL", "Y", "UE"]);
const ENTITY_TYPE_WORDS = new Set(["MUNICIPALIDAD", "PROVINCIAL", "DISTRITAL", "GOBIERNO", "REGIONAL", "REGION", "PROYECTO", "ESPECIAL"]);
const CANDIDATE_MIN_SCORE = 0.4;

function normalize(name: string): string {
  return name.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function coreTokens(name: string): Set<string> {
  return new Set(normalize(name).split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t)));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}
function matchEntities<A extends { id: string; nombre: string }, B extends { id: string; nombre: string }>(
  as: readonly A[],
  bs: readonly B[]
): Array<{ a: A; b: B; confidence: MatchConfidence }> {
  const aNorm = as.map((item) => ({ item, norm: normalize(item.nombre), tokens: coreTokens(item.nombre) }));
  const matches: Array<{ a: A; b: B; confidence: MatchConfidence }> = [];
  for (const b of bs) {
    const bNorm = normalize(b.nombre);
    const bTokens = coreTokens(b.nombre);
    const exact = aNorm.find((a) => a.norm === bNorm);
    if (exact) {
      matches.push({ a: exact.item, b, confidence: "confirmada" });
      continue;
    }
    let best: { a: (typeof aNorm)[number]; score: number } | null = null;
    for (const a of aNorm) {
      let sharedDistinctive = 0;
      for (const t of bTokens) if (a.tokens.has(t) && !ENTITY_TYPE_WORDS.has(t)) sharedDistinctive += 1;
      const score = jaccard(bTokens, a.tokens);
      if (sharedDistinctive >= 1 && score >= CANDIDATE_MIN_SCORE && (!best || score > best.score)) best = { a, score };
    }
    if (best) matches.push({ a: best.a.item, b, confidence: "candidata" });
  }
  return matches;
}

interface TitularMineroRow extends NeonRow {
  titular: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  concesion: string | null;
  hectareas: number | string | null;
}

interface SancionRow extends NeonRow {
  razon_social: string | null;
  resolucion: string | null;
  desde: string | null;
  hasta: string | null;
  estado: string | null;
  descripcion: string | null;
}

/**
 * Handler para `territorio_inteligencia_titulares_riesgo` — GET /api/titulares-riesgo.
 * Origen: apps/territorio-inteligencia/api/src/services/titulares-riesgo.service.ts.
 * Solo `tipoCatastro: "minero"` -- el catastro forestal no tiene titular
 * (SERFOR no lo publica), no hay nada que cruzar ahí.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { args, env } = ctx;
  const filtroNombre = args.ruc as string | undefined;
  const departamento = args.departamento as string | undefined;
  const soloVigentes = args.soloVigentes === true || args.soloVigentes === "true";

  const catastroMineroPool = getPoolForApp(env as NeonEnv, "catastro-minero");
  const sancionesPool = getPoolForApp(env as NeonEnv, "proveedores-sancionados");
  if (!catastroMineroPool || !sancionesPool) {
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", resultados: [] } };
  }

  // `filtroNombre` se empuja al SQL (`titular ILIKE`) — ver nota equivalente
  // en la ruta HTTP de origen (sin esto, cada request cargaba ~66.8k filas y
  // las matcheaba todas contra las sanciones aunque el caller ya pedía un
  // nombre específico).
  const condiciones: string[] = [];
  const params: unknown[] = [];
  if (departamento) {
    params.push(`%${departamento}%`);
    condiciones.push(`departamento ILIKE $${params.length}`);
  }
  if (filtroNombre) {
    params.push(`%${filtroNombre}%`);
    condiciones.push(`titular ILIKE $${params.length}`);
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  const { rows: titulares } = await catastroMineroPool.query<TitularMineroRow>(
    `SELECT titular, departamento, provincia, distrito, concesion, hectareas
     FROM catastro_minero_derechos ${where}`,
    params
  );

  const vigenteClause = soloVigentes ? "AND estado ILIKE '%VIGENTE%'" : "";
  const [inhabs, juds, multas] = await Promise.all([
    sancionesPool.query<SancionRow>(
      `SELECT ruc, razon_social, resolucion, desde::text, hasta::text, estado,
              infraccion as descripcion
       FROM inhabilitaciones WHERE razon_social IS NOT NULL ${vigenteClause}`
    ),
    sancionesPool.query<SancionRow>(
      `SELECT ruc_dni as ruc, nombre as razon_social, numero_resolucion as resolucion,
              fecha_inicio::text as desde, fecha_fin::text as hasta,
              NULL::text as estado, organo_jurisdiccional as descripcion
       FROM inhabilitaciones_judiciales WHERE nombre IS NOT NULL`
    ),
    sancionesPool.query<SancionRow>(
      `SELECT ruc, razon_social, resolucion, desde::text, hasta::text, estado,
              infraccion as descripcion
       FROM multas WHERE razon_social IS NOT NULL ${vigenteClause}`
    ),
  ]);
  const sanciones = [
    ...inhabs.rows.map((r) => ({ ...r, tipo: "inhabilitacion" as const })),
    ...juds.rows.map((r) => ({ ...r, tipo: "judicial" as const })),
    ...multas.rows.map((r) => ({ ...r, tipo: "multa" as const })),
  ];

  const porTitular = new Map<string, { hectareas: number; concesiones: Set<string>; ubicacion: string | null }>();
  for (const t of titulares) {
    const key = t.titular.trim();
    const actual = porTitular.get(key) ?? { hectareas: 0, concesiones: new Set<string>(), ubicacion: null };
    actual.hectareas += t.hectareas ? Number(t.hectareas) : 0;
    if (t.concesion) actual.concesiones.add(t.concesion);
    if (!actual.ubicacion && (t.departamento || t.provincia || t.distrito)) {
      actual.ubicacion = [t.departamento, t.provincia, t.distrito].filter(Boolean).join(" - ");
    }
    porTitular.set(key, actual);
  }

  const ladoTitulares = [...porTitular.keys()].map((nombre) => ({ id: nombre, nombre }));
  const ladoSanciones = sanciones
    .filter((s) => s.razon_social)
    .map((s, idx) => ({ id: String(idx), nombre: s.razon_social!, sancion: s }));
  const matches = matchEntities(ladoTitulares, ladoSanciones);

  const riesgosPorTitular = new Map<string, unknown[]>();
  for (const m of matches) {
    const lista = riesgosPorTitular.get(m.a.id) ?? [];
    const s = m.b.sancion;
    lista.push({
      tipo: s.tipo,
      resolucion: s.resolucion ?? "",
      desde: s.desde,
      hasta: s.hasta,
      estado: s.estado ?? "",
      descripcion: s.descripcion ?? undefined,
      confianza: m.confidence,
    });
    riesgosPorTitular.set(m.a.id, lista);
  }

  // `filtroNombre` ya se aplicó en SQL arriba — `porTitular` solo contiene
  // titulares que ya calzaron ese filtro.
  const resultados = [];
  for (const [nombre, riesgos] of riesgosPorTitular) {
    const info = porTitular.get(nombre)!;
    resultados.push({
      titular: nombre,
      tipoCatastro: "minero" as const,
      concesiones: [...info.concesiones],
      superficie: info.hectareas || null,
      ubicacion: info.ubicacion,
      riesgos,
    });
  }

  return { status: 200, body: resultados };
}

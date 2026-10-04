import type { NeonRow } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

// @fidelity: precomputado
//
// Origen: apps/legislativo-congreso/api/src/routes/cruces.ts, con el SQL en
// src/crossref/infobras-matcher.ts.
//
// El marcador está porque el SQL no vive en el route sino en `crossref/` de la
// app — que es lo que `fuenteDeCalculo` suma al corpus. No por precomputación en
// tabla: el matching es en línea. Ninguna consulta necesita `@nuevo:`; si el
// port se desvía del original, el test lo marca.

/**
 * Cruce de proyectos de ley del Congreso con obras públicas de INFOBRAS.
 *
 * Réplica de `apps/legislativo-congreso/api/src/routes/cruces.ts` +
 * `src/crossref/infobras-matcher.ts` + `src/lib/keyword-matcher.ts`.
 *
 * El pool de INFOBRAS se resuelve vía `getPoolForApp(env, "infobras")` en vez
 * de `${INFOBRAS_DATABASE_URL}`: cruce entre bases distintas no se resuelve en
 * un solo SQL (ver docblock de `ToolHandlerContext.env`). Las consultas van
 * secuenciales a propósito por lo mismo.
 *
 * `extractKeywords`/`calculateMatchScore` están duplicados aquí a mano, igual
 * que el SQL está duplicado en los demás handlers: mcp-server no importa
 * código de las apps. Si cambia el matcher en la app, hay que cambiarlo
 * acá — `cruces.test.ts` cubre que ambos computen lo mismo.
 */

const DEFAULT_PERIODO = 2026;
const DEFAULT_UMBRAL = 0.3;
const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const OBRAS_CANDIDATAS_LIMIT = 500;

const STOPWORDS = new Set([
  "el", "la", "de", "en", "por", "para", "con", "sin", "a", "que", "y", "o",
  "un", "una", "los", "las", "del", "al", "como", "sea", "ser", "está", "están",
  "su", "sus", "este", "esta", "estos", "estas", "otro", "otra", "otros", "otras",
  "todo", "toda", "todos", "todas", "cada", "cual", "cuales", "donde", "cuando",
  "más", "menos", "entre", "sobre", "contra", "hacia", "hasta", "desde", "hacer",
  "tener", "haber", "poder", "deber", "saber", "ver", "dar", "ir", "venir", "salir",
  "decir", "poner", "quedar", "tomar", "traer", "llevar", "pasar", "entrar",
  "general", "nacional", "público", "privado", "social", "económico", "político",
  "mediante", "dentro", "fuera", "durante", "después", "antes", "siempre",
  "nunca", "jamás", "tal", "quien", "quienes", "algo", "nada", "alguien",
  "nadie", "alguno", "alguna", "algunos", "algunas", "ninguno", "ninguna", "ningunos",
  "ningunas", "mucho", "mucha", "muchos", "muchas", "poco", "poca", "pocos", "pocas",
  "bien", "mal", "mejor", "peor", "mayor", "menor", "grande", "pequeño", "alto", "bajo",
  "largo", "corto", "ancho", "estrecho", "nuevo", "viejo", "mismo", "misma", "propios",
  "propia", "propias", "solo", "sola", "solos", "solas", "primer", "primera",
  "primero", "segundo", "segunda", "último", "última", "últimos", "últimas",
]);

function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractKeywords(text: string): string[] {
  if (!text) return [];
  return normalizeText(text)
    .split(/[\s,;:.()\-–—_\/"']/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
}

function findMatchedKeywords(keywords: string[], target: string): string[] {
  const t = normalizeText(target);
  if (!t) return [];
  return keywords.filter((kw) => t.includes(kw));
}

function calculateMatchScore(keywords: string[], target: string): number {
  if (keywords.length === 0) return 0;
  return findMatchedKeywords(keywords, target).length / keywords.length;
}

interface ProyectoRow extends NeonRow {
  per_par_id: number;
  pley_num: number;
  proyecto_ley: string;
  estado: string;
  fecha_presentacion: string | null;
  titulo: string;
  proponente: string | null;
  autores: string | null;
}

interface ObraRow extends NeonRow {
  codigo_infobras: string;
  codigo_entidad: string;
  entidad_nombre: string;
  nombre_obra: string;
  modalidad_ejecucion: string | null;
  naturaleza_obra: string | null;
  estado_ejecucion: string | null;
  nivel_gobierno: string | null;
  sector_entidad: string | null;
  cui: string | null;
  nombre_inversion: string | null;
  monto_viable: string | null;
  costo_actualizado: string | null;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  avance_fisico_real_pct: string | null;
  ejecucion_financiera_pct: string | null;
  existe_paralizacion: boolean;
  causal_paralizacion: string | null;
  fecha_paralizacion: string | null;
  dias_paralizado: number | null;
}

function toNum(v: string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function mapProyecto(r: ProyectoRow) {
  return {
    perParId: r.per_par_id,
    pleyNum: r.pley_num,
    proyectoLey: r.proyecto_ley,
    estado: r.estado,
    fechaPresentacion: r.fecha_presentacion,
    titulo: r.titulo,
    proponente: r.proponente,
    autores: r.autores,
  };
}

function mapObra(r: ObraRow) {
  return {
    codigoInfobras: r.codigo_infobras,
    codigoEntidad: r.codigo_entidad,
    entidadNombre: r.entidad_nombre,
    nombreObra: r.nombre_obra,
    modalidadEjecucion: r.modalidad_ejecucion,
    naturalezaObra: r.naturaleza_obra,
    estadoEjecucion: r.estado_ejecucion,
    nivelGobierno: r.nivel_gobierno,
    sectorEntidad: r.sector_entidad,
    cui: r.cui,
    nombreInversion: r.nombre_inversion,
    montoViable: toNum(r.monto_viable),
    costoActualizado: toNum(r.costo_actualizado),
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    avanceFisicoRealPct: toNum(r.avance_fisico_real_pct),
    ejecucionFinancieraPct: toNum(r.ejecucion_financiera_pct),
    existeParalizacion: r.existe_paralizacion,
    causalParalizacion: r.causal_paralizacion,
    fechaParalizacion: r.fecha_paralizacion,
    diasParalizado: r.dias_paralizado,
  };
}

const OBRA_SELECT = `
  SELECT codigo_infobras, codigo_entidad, entidad_nombre, nombre_obra,
         modalidad_ejecucion, naturaleza_obra, estado_ejecucion, nivel_gobierno, sector_entidad,
         cui, nombre_inversion, monto_viable, costo_actualizado,
         departamento, provincia, distrito,
         avance_fisico_real_pct, ejecucion_financiera_pct,
         existe_paralizacion, causal_paralizacion, fecha_paralizacion, dias_paralizado
  FROM public_works`;

/**
 * Una sola query con OR de todas las keywords. Pide LIMIT+1 para poder
 * reportar `truncated` en vez de cortar en silencio.
 */
async function fetchObras(
  infobras: ReturnType<typeof getPoolForApp> & object,
  departamento: string,
  keywords: string[]
): Promise<{ obras: ObraRow[]; truncated: boolean }> {
  const params: unknown[] = [departamento];
  const conds = keywords.map((kw) => {
    params.push(`%${kw}%`);
    return `nombre_obra ILIKE $${params.length}`;
  });

  const { rows } = await infobras.query<ObraRow>(
    `${OBRA_SELECT}
     WHERE departamento = $1 AND (${conds.join(" OR ")})
     ORDER BY codigo_infobras
     LIMIT ${OBRAS_CANDIDATAS_LIMIT + 1}`,
    params
  );

  return {
    obras: rows.slice(0, OBRAS_CANDIDATAS_LIMIT),
    truncated: rows.length > OBRAS_CANDIDATAS_LIMIT,
  };
}

const FUENTE = {
  dataset: "Congreso de la República - Proyectos de Ley × INFOBRAS - Obras Públicas",
  nota: "Cruce keyword-based sin IA. Score de match indica palabras clave coincidentes del título del proyecto en el nombre de la obra.",
};

/**
 * Handler para `legislativo_congreso_cruces_infobras` — GET /api/cruces/proyectos-infobras.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;

  const departamento = ((args.departamento as string | undefined) ?? DEFAULT_DEPARTAMENTO).toUpperCase();
  const periodo = args.periodo !== undefined ? Number(args.periodo) : DEFAULT_PERIODO;
  const umbral = args.umbral_score !== undefined ? Number(args.umbral_score) : DEFAULT_UMBRAL;
  const limit = Math.min(args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const { rows: proyectos } = await db.query<ProyectoRow>(
    `SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores
     FROM legislativo_congreso_proyectos
     WHERE per_par_id = $1
     ORDER BY fecha_presentacion DESC NULLS LAST`,
    [periodo]
  );

  const matcheables = proyectos
    .map((row) => ({ row, keywords: extractKeywords(row.titulo) }))
    .filter((p) => p.keywords.length > 0);

  if (matcheables.length === 0) {
    return {
      status: 200,
      body: { total: 0, limit, offset, periodo, hasMore: false, truncated: false, resultados: [], fuente: FUENTE },
    };
  }

  const infobras = getPoolForApp(env as NeonEnv, "infobras");
  if (!infobras) {
    return {
      status: 503,
      body: { error: "Cruce no disponible", detalle: "INFOBRAS no está accesible" },
    };
  }

  const keywords = [...new Set(matcheables.flatMap((p) => p.keywords))];
  const { obras, truncated } = await fetchObras(infobras, departamento, keywords);

  const cruces = crucesEntre(matcheables, obras, umbral);

  return {
    status: 200,
    body: {
      total: cruces.length,
      limit,
      offset,
      periodo,
      hasMore: offset + Math.min(cruces.length, limit) < cruces.length,
      truncated,
      resultados: cruces.slice(offset, offset + limit),
      fuente: FUENTE,
    },
  };
}

/**
 * Handler para `legislativo_congreso_cruce_infobras_proyecto` —
 * GET /api/cruces/proyectos-infobras/{periodo}/{numero}.
 */
export async function proyecto(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;

  const periodo = Number(args.periodo);
  const numero = Number(args.numero);
  const departamento = ((args.departamento as string | undefined) ?? DEFAULT_DEPARTAMENTO).toUpperCase();
  const umbral = args.umbral_score !== undefined ? Number(args.umbral_score) : DEFAULT_UMBRAL;

  const { rows: proyectos } = await db.query<ProyectoRow>(
    `SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores
     FROM legislativo_congreso_proyectos
     WHERE per_par_id = $1 AND pley_num = $2`,
    [periodo, numero]
  );

  if (proyectos.length === 0) {
    return { status: 404, body: { error: "Proyecto no encontrado" } };
  }

  const row = proyectos[0];
  const keywords = extractKeywords(row.titulo);
  if (keywords.length === 0) {
    return {
      status: 404,
      body: {
        error: "No se encontraron obras que matcheen este proyecto",
        periodo,
        numero,
        departamento,
        umbral_score: umbral,
      },
    };
  }

  const infobras = getPoolForApp(env as NeonEnv, "infobras");
  if (!infobras) {
    return {
      status: 503,
      body: { error: "Cruce no disponible", detalle: "INFOBRAS no está accesible" },
    };
  }

  const { obras, truncated } = await fetchObras(infobras, departamento, keywords);
  const cruces = crucesEntre([{ row, keywords }], obras, umbral);

  if (cruces.length === 0) {
    return {
      status: 404,
      body: {
        error: "No se encontraron obras que matcheen este proyecto",
        periodo,
        numero,
        departamento,
        umbral_score: umbral,
      },
    };
  }

  return {
    status: 200,
    body: {
      proyecto: { perParId: periodo, pleyNum: numero },
      departamento,
      umbral_score: umbral,
      total: cruces.length,
      truncated,
      resultados: cruces,
      fuente: FUENTE,
    },
  };
}

function crucesEntre(
  matcheables: Array<{ row: ProyectoRow; keywords: string[] }>,
  obras: ObraRow[],
  umbral: number
) {
  const out: Array<{
    proyecto: ReturnType<typeof mapProyecto>;
    obra: ReturnType<typeof mapObra>;
    matchScore: number;
    matchedKeywords: string[];
  }> = [];

  for (const { row, keywords } of matcheables) {
    for (const obra of obras) {
      const matchScore = calculateMatchScore(keywords, obra.nombre_obra);
      if (matchScore >= umbral) {
        out.push({
          proyecto: mapProyecto(row),
          obra: mapObra(obra),
          matchScore,
          matchedKeywords: findMatchedKeywords(keywords, obra.nombre_obra),
        });
      }
    }
  }

  return out.sort((a, b) => b.matchScore - a.matchScore);
}
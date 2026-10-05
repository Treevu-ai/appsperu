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
const DEFAULT_UMBRAL = 0.5;
const DEFAULT_MATCHED_MINIMO = 2;
const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Catálogo y alias de departamento. Duplicado de
 * `apps/legislativo-congreso/api/src/lib/departamentos.ts`: el handler de la
 * API resuelve y valida `departamento` en la capa de rutas, pero el MCP
 * despacha directo a este handler sin pasar por ahí. Sin esto, "P C DEL
 * CALLAO" llegaba tal cual a la query exacta de INFOBRAS (0 filas, nunca
 * CALLAO) y un departamento inexistente devolvía 200/404 en vez de 400.
 */
const PERU_DEPARTAMENTOS = new Set([
  "AMAZONAS", "ANCASH", "APURIMAC", "AREQUIPA", "AYACUCHO", "CAJAMARCA", "CALLAO",
  "CUSCO", "HUANCAVELICA", "HUANUCO", "ICA", "JUNIN", "LA LIBERTAD", "LAMBAYEQUE",
  "LIMA", "LORETO", "MADRE DE DIOS", "MOQUEGUA", "PASCO", "PIURA", "PUNO",
  "SAN MARTIN", "TACNA", "TUMBES", "UCAYALI",
]);

const ALIAS_DEPARTAMENTO: Record<string, string> = {
  "P C DEL CALLAO": "CALLAO",
  "PROVINCIA CONSTITUCIONAL DEL CALLAO": "CALLAO",
  "CALLAO PROVINCIAL": "CALLAO",
};

/** `null` si `raw` no resuelve a un departamento del catálogo peruano. */
function resolverDepartamento(raw: string): string | null {
  const limpio = raw.trim().toUpperCase().replace(/\s+/g, " ");
  const canonico = ALIAS_DEPARTAMENTO[limpio] ?? limpio;
  return PERU_DEPARTAMENTOS.has(canonico) ? canonico : null;
}

/**
 * Tokens administrativos que los nombres de obra embeben ("DEL DISTRITO DE …
 * PROVINCIA … DEPARTAMENTO …"). Dentro de un departamento no distinguen una obra
 * de otra, y excluirlos del índice bajó los cruces de 675,856 a 26,693 en la
 * corrida real de LA LIBERTAD periodo 2021. Duplicado de
 * `apps/legislativo-congreso/api/src/crossref/obra-index.ts`; la paridad la
 * fija `cruces.test.ts`.
 */
const TOKENS_ADMINISTRATIVOS = new Set([
  "distrito", "provincia", "departamento", "municipalidad", "municipal",
  "gobierno", "nivel", "region", "provincial", "localidad", "caserio",
  "centro", "poblado", "comunidad", "ubicacion", "geografico",
]);

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

/** Sufijos plurales → singular. Ver `keyword-matcher.ts` de la app. */
const SUFIJOS_PLURAL: ReadonlyArray<readonly [string, string]> = [
  ["amientos", "amiento"],
  ["imientos", "imiento"],
  ["aciones", "acion"],
  ["uciones", "ucion"],
  ["ancias", "ancia"],
  ["encias", "encia"],
  ["ismos", "ismo"],
  ["anzas", "anza"],
  ["es", ""],
  ["s", ""],
];

function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeToken(token: string): string {
  const t = normalizeText(token);
  if (t.length < 5) return t;
  for (const [plural, singular] of SUFIJOS_PLURAL) {
    if (t.endsWith(plural) && t.length - plural.length >= 4) {
      return t.slice(0, t.length - plural.length) + singular;
    }
  }
  return t;
}

/** Tokens por palabra completa, no por subcadena. Ver `keyword-matcher.ts`. */
function tokenize(text: string): string[] {
  const normalizado = normalizeText(text);
  if (!normalizado) return [];
  const tokens: string[] = [];
  for (const bruto of normalizado.split(/[^a-z0-9]+/)) {
    if (bruto.length > 2 && !STOPWORDS.has(bruto)) tokens.push(normalizeToken(bruto));
  }
  return tokens;
}

/**
 * Deduplica por `normalizeToken`, no por la palabra cruda. Ver
 * `keyword-matcher.ts` de la app: sin esto, "obra"/"obras" cuentan como dos
 * coincidencias de un mismo posting e inflan `matched`.
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];
  const vistos = new Set<string>();
  const keywords: string[] = [];
  for (const w of normalizeText(text).split(/[\s,;:.()\-–—_\/"']/)) {
    if (w.length <= 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    const canonico = normalizeToken(w);
    if (vistos.has(canonico)) continue;
    vistos.add(canonico);
    keywords.push(w);
  }
  return keywords;
}

function findMatchedKeywords(keywords: string[], target: string): string[] {
  const objetivo = new Set(tokenize(target));
  if (objetivo.size === 0) return [];
  return keywords.filter((kw) => objetivo.has(normalizeToken(kw)));
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
interface IndiceObras {
  obras: ObraRow[];
  postings: Map<string, number[]>;
}

/**
 * Lee todas las obras del departamento y tokeniza sus nombres una sola vez.
 * Duplica `construirIndiceObras` de
 * `apps/legislativo-congreso/api/src/crossref/obra-index.ts`: el `rootDir: src`
 * de mcp-server impide importar de fuera sin romper el bundle del Worker, igual
 * que con `packages/shared-queries` (ADR-0019). La paridad la fija
 * `cruces.test.ts`.
 */
async function cargarIndice(
  infobras: ReturnType<typeof getPoolForApp> & object,
  departamento: string
): Promise<IndiceObras> {
  const { rows } = await infobras.query<ObraRow>(
    `${OBRA_SELECT}
     WHERE departamento = $1
     ORDER BY codigo_infobras`,
    [departamento]
  );

  const postings = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    for (const token of new Set(tokenize(rows[i].nombre_obra))) {
      if (TOKENS_ADMINISTRATIVOS.has(token)) continue;
      let lista = postings.get(token);
      if (!lista) postings.set(token, (lista = []));
      lista.push(i);
    }
  }

  return { obras: rows, postings };
}

/**
 * Puntúa un proyecto contra el índice recorriendo solo los postings de sus
 * keywords, y sin tope de candidatas. Devuelve tuplas (score + índices) para no
 * hidratar objetos que la paginación va a descartar.
 */
function puntuarProyecto(
  indice: IndiceObras,
  keywords: string[],
  umbral: number,
  matchedMinimo: number
): Array<{ proyectoIdx: number; obraIdx: number; matchScore: number; matchedKeywords: string[] }> {
  if (keywords.length === 0 || indice.obras.length === 0) return [];

  const acumulados = new Map<number, { matched: number; hit: string[] }>();
  for (const kw of keywords) {
    const lista = indice.postings.get(normalizeToken(kw));
    if (!lista) continue;
    for (const i of lista) {
      let acc = acumulados.get(i);
      if (!acc) acumulados.set(i, (acc = { matched: 0, hit: [] }));
      acc.matched++;
      acc.hit.push(kw);
    }
  }

  const out: Array<{ proyectoIdx: number; obraIdx: number; matchScore: number; matchedKeywords: string[] }> = [];
  for (const [obraIdx, acc] of acumulados) {
    if (acc.matched < matchedMinimo) continue;
    const matchScore = acc.matched / keywords.length;
    if (matchScore < umbral) continue;
    out.push({ proyectoIdx: 0, obraIdx, matchScore, matchedKeywords: acc.hit });
  }
  return out;
}

/** Orden total y estable: score desc, luego proyecto y obra por clave. */
function ordenarTuplas(
  tuplas: Array<{ proyectoIdx: number; obraIdx: number; matchScore: number; matchedKeywords: string[] }>,
  proyectos: ProyectoRow[],
  obras: ObraRow[]
) {
  return tuplas.sort(
    (a, b) =>
      b.matchScore - a.matchScore ||
      proyectos[a.proyectoIdx].pley_num - proyectos[b.proyectoIdx].pley_num ||
      obras[a.obraIdx].codigo_infobras.localeCompare(obras[b.obraIdx].codigo_infobras)
  );
}

const FUENTE = {
  dataset: "Congreso de la República - Proyectos de Ley × INFOBRAS - Obras Públicas",
  nota: "Cruce keyword-based sin IA ni embeddings. matchScore es la fracción de keywords del título presentes en el nombre de la obra, con coincidencia por token completo: un score alto no prueba causalidad.",
};

/**
 * Handler para `legislativo_congreso_cruces_infobras` — GET /api/cruces/proyectos-infobras.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;

  const rawDepartamento = (args.departamento as string | undefined) ?? DEFAULT_DEPARTAMENTO;
  const departamento = resolverDepartamento(rawDepartamento);
  if (departamento === null) {
    return {
      status: 400,
      body: {
        error: "Departamento inválido",
        detalle: `Departamento fuera del catálogo peruano: "${rawDepartamento}"`,
      },
    };
  }
  const periodo = args.periodo !== undefined ? Number(args.periodo) : DEFAULT_PERIODO;
  const umbral = args.umbral_score !== undefined ? Number(args.umbral_score) : DEFAULT_UMBRAL;
  const matchedMinimo = args.matched_minimo !== undefined ? Number(args.matched_minimo) : DEFAULT_MATCHED_MINIMO;
  const limit = Math.min(args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const { rows: proyectos } = await db.query<ProyectoRow>(
    `SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores
     FROM legislativo_congreso_proyectos
     WHERE per_par_id = $1
     ORDER BY fecha_presentacion DESC NULLS LAST`,
    [periodo]
  );

  const keywordsPorProyecto = proyectos.map((row) => extractKeywords(row.titulo));

  // La degradación se declara antes del fast path de "nada que cruzar": con el
  // pool ausente, un periodo sin proyectos con keywords devolvería 200 con
  // total:0, indistinguible de un cruce que sí se consultó y no matcheó.
  const infobras = getPoolForApp(env as NeonEnv, "infobras");
  if (!infobras) {
    return {
      status: 503,
      body: { error: "Cruce no disponible", detalle: "INFOBRAS no está accesible" },
    };
  }

  if (keywordsPorProyecto.every((k) => k.length === 0)) {
    return {
      status: 200,
      body: { total: 0, limit, offset, periodo, hasMore: false, resultados: [], fuente: FUENTE },
    };
  }

  const indice = await cargarIndice(infobras, departamento);

  type Tupla = { proyectoIdx: number; obraIdx: number; matchScore: number; matchedKeywords: string[] };
  const tuplas: Tupla[] = [];
  for (let i = 0; i < proyectos.length; i++) {
    const keywords = keywordsPorProyecto[i];
    if (keywords.length === 0) continue;
    for (const t of puntuarProyecto(indice, keywords, umbral, matchedMinimo)) {
      tuplas.push({ ...t, proyectoIdx: i });
    }
  }
  ordenarTuplas(tuplas, proyectos, indice.obras);

  const pagina = tuplas.slice(offset, offset + limit);
  return {
    status: 200,
    body: {
      total: tuplas.length,
      limit,
      offset,
      periodo,
      hasMore: offset + pagina.length < tuplas.length,
      resultados: pagina.map((t) => ({
        proyecto: mapProyecto(proyectos[t.proyectoIdx]),
        obra: mapObra(indice.obras[t.obraIdx]),
        matchScore: t.matchScore,
        matchedKeywords: t.matchedKeywords,
      })),
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
  const rawDepartamento = (args.departamento as string | undefined) ?? DEFAULT_DEPARTAMENTO;
  const departamento = resolverDepartamento(rawDepartamento);
  if (departamento === null) {
    return {
      status: 400,
      body: {
        error: "Departamento inválido",
        detalle: `Departamento fuera del catálogo peruano: "${rawDepartamento}"`,
      },
    };
  }
  const umbral = args.umbral_score !== undefined ? Number(args.umbral_score) : DEFAULT_UMBRAL;
  const matchedMinimo = args.matched_minimo !== undefined ? Number(args.matched_minimo) : DEFAULT_MATCHED_MINIMO;

  const { rows: proyectos } = await db.query<ProyectoRow>(
    `SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores
     FROM legislativo_congreso_proyectos
     WHERE per_par_id = $1 AND pley_num = $2`,
    [periodo, numero]
  );

  if (proyectos.length === 0) {
    return { status: 404, body: { error: "Proyecto no encontrado" } };
  }

  // El proyecto existe, así que este camino sí corresponde a un cruce: la
  // degradación se declara aunque su título no rinda keywords.
  const infobras = getPoolForApp(env as NeonEnv, "infobras");
  if (!infobras) {
    return {
      status: 503,
      body: { error: "Cruce no disponible", detalle: "INFOBRAS no está accesible" },
    };
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

  const indice = await cargarIndice(infobras, departamento);
  const cruces = ordenarTuplas(puntuarProyecto(indice, keywords, umbral, matchedMinimo), proyectos, indice.obras);

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
      resultados: cruces.map((t) => ({
        proyecto: mapProyecto(proyectos[t.proyectoIdx]),
        obra: mapObra(indice.obras[t.obraIdx]),
        matchScore: t.matchScore,
        matchedKeywords: t.matchedKeywords,
      })),
      fuente: FUENTE,
    },
  };
}
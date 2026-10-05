/**
 * Cruce entre proyectos de ley y obras públicas (INFOBRAS).
 *
 * Estrategia:
 * 1. Las obras del departamento se leen una vez y se tokenizan en un índice
 *    invertido (token → obras), sin límite de candidatas.
 * 2. Cada proyecto del periodo se puntúa contra ese índice recorriendo solo los
 *    postings de sus keywords.
 * 3. Se pagina sobre el conjunto completo con orden total estable.
 *
 * Por qué ya no un `ILIKE` por keyword: contra la ingesta real, el periodo
 * 2021 producía 12,888 keywords únicas y la query `nombre_obra ILIKE $n OR ...`
 * tardaba 17.2 s en LA LIBERTAD, de los cuales 10,105 cláusulas (78%) no
 * matcheaban ninguna obra. Encima truncaba en 500 por `codigo_infobras` —por
 * código, no por relevancia—, así que en un departamento de 10,134 obras
 * devolvía las 500 de código más bajo: el resultado no era solo incompleto, era
 * sesgado. Medido en vivo 2026-10-04; ver `docs/data-contracts/legislativo-congreso-cruces.md`.
 */

import type { Pool } from "pg";
import { pool } from "../db/pool.js";
import { requireCrossAppPool } from "../lib/cross-app-pool.js";
import { extractKeywords } from "../lib/keyword-matcher.js";
import { canonicalizarDepartamento } from "../lib/departamentos.js";
import { construirIndiceObras, puntuarProyecto, type IndiceObras } from "./obra-index.js";

/** Defaults del cruce. El umbral sube de 0.3 a 0.5 con la ingesta real. */
export const UMBRAL_SCORE_DEFAULT = 0.5;
/**
 * Mínimo de keywords coincidentes además de la fracción. Con solo la fracción,
 * 1 keyword sobre 3 puntúa 0.33 y pasa el corte; en la corrida real ese fue el
 * grueso de los cruces de baja confianza.
 */
export const MATCHED_MINIMO_DEFAULT = 2;


interface ProyectoRow {
  per_par_id: number;
  pley_num: number;
  proyecto_ley: string;
  estado: string;
  fecha_presentacion: string | null;
  titulo: string;
  proponente: string | null;
  autores: string | null;
}

interface ObraRow {
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
  monto_viable: number | string | null;
  costo_actualizado: number | string | null;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  avance_fisico_real_pct: number | string | null;
  ejecucion_financiera_pct: number | string | null;
  existe_paralizacion: boolean;
  causal_paralizacion: string | null;
  fecha_paralizacion: string | null;
  dias_paralizado: number | null;
}

interface ProyectoMatcheable {
  row: ProyectoRow;
  keywords: string[];
}

/**
 * Cruce de una página. Ya no existe `truncated`: el campo existía para avisar
 * que el tope de 500 obras candidatas había cortado el cruce. Sin tope, el
 * `total` es el conteo real del conjunto completo y no hay nada que declarar.
 * Esa era además la ambigüedad que el contrato intentaba documentar: un
 * `truncated: true` con `total: 0` era indistinguible de "no hay obras".
 */
export interface CruceResultado {
  total: number;
  cruces: CruceProyectoInfobrasResult[];
  hasMore: boolean;
}

export interface CruceProyectoInfobrasResult {
  proyecto: {
    perParId: number;
    pleyNum: number;
    proyectoLey: string;
    estado: string;
    fechaPresentacion: string | null;
    titulo: string;
    proponente: string | null;
    autores: string | null;
  };
  obra: {
    codigoInfobras: string;
    codigoEntidad: string;
    entidadNombre: string;
    nombreObra: string;
    modalidadEjecucion: string | null;
    naturalezaObra: string | null;
    estadoEjecucion: string | null;
    nivelGobierno: string | null;
    sectorEntidad: string | null;
    cui: string | null;
    nombreInversion: string | null;
    montoViable: number | null;
    costoActualizado: number | null;
    departamento: string;
    provincia: string | null;
    distrito: string | null;
    avanceFisicoRealPct: number | null;
    ejecucionFinancieraPct: number | null;
    existeParalizacion: boolean;
    causalParalizacion: string | null;
    fechaParalizacion: string | null;
    diasParalizado: number | null;
  };
  matchScore: number;
  matchedKeywords: string[];
}

const OBRA_SELECT = `
  SELECT codigo_infobras, codigo_entidad, entidad_nombre, nombre_obra,
         modalidad_ejecucion, naturaleza_obra, estado_ejecucion, nivel_gobierno, sector_entidad,
         cui, nombre_inversion, monto_viable, costo_actualizado,
         departamento, provincia, distrito,
         avance_fisico_real_pct, ejecucion_financiera_pct,
         existe_paralizacion, causal_paralizacion, fecha_paralizacion, dias_paralizado
  FROM public_works`;

function toNum(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function mapProyecto(row: ProyectoRow): CruceProyectoInfobrasResult["proyecto"] {
  return {
    perParId: row.per_par_id,
    pleyNum: row.pley_num,
    proyectoLey: row.proyecto_ley,
    estado: row.estado,
    fechaPresentacion: row.fecha_presentacion,
    titulo: row.titulo,
    proponente: row.proponente,
    autores: row.autores,
  };
}

function mapObra(row: ObraRow): CruceProyectoInfobrasResult["obra"] {
  return {
    codigoInfobras: row.codigo_infobras,
    codigoEntidad: row.codigo_entidad,
    entidadNombre: row.entidad_nombre,
    nombreObra: row.nombre_obra,
    modalidadEjecucion: row.modalidad_ejecucion,
    naturalezaObra: row.naturaleza_obra,
    estadoEjecucion: row.estado_ejecucion,
    nivelGobierno: row.nivel_gobierno,
    sectorEntidad: row.sector_entidad,
    cui: row.cui,
    nombreInversion: row.nombre_inversion,
    montoViable: toNum(row.monto_viable),
    costoActualizado: toNum(row.costo_actualizado),
    departamento: row.departamento,
    provincia: row.provincia,
    distrito: row.distrito,
    avanceFisicoRealPct: toNum(row.avance_fisico_real_pct),
    ejecucionFinancieraPct: toNum(row.ejecucion_financiera_pct),
    existeParalizacion: row.existe_paralizacion,
    causalParalizacion: row.causal_paralizacion,
    fechaParalizacion: row.fecha_paralizacion,
    diasParalizado: row.dias_paralizado,
  };
}

/**
 * Lee las obras del departamento y construye el índice invertido. Sin `LIMIT`:
 * el corte anterior por `codigo_infobras` era el sesgo del cruce.
 */
async function cargarIndice(infobrasDb: Pool, departamento: string): Promise<IndiceObras<ObraRow>> {
  const { rows } = await infobrasDb.query<ObraRow>(
    `${OBRA_SELECT}
     WHERE departamento = $1
     ORDER BY codigo_infobras`,
    [canonicalizarDepartamento(departamento)]
  );
  return construirIndiceObras(rows);
}

/** Una coincidencia antes de hidratarla: solo índices y números. */
interface TuplaCruce {
  proyectoIdx: number;
  obraIdx: number;
  matchScore: number;
  matchedKeywords: string[];
}

/**
 * Orden total y estable: score desc, luego proyecto y obra por clave. Sin el
 * desempate la paginación devuelve páginas distintas en la misma consulta, y
 * con `limit` sobre un conjunto grande eso se nota.
 */
function ordenarTuplas(tuplas: TuplaCruce[], proyectos: ProyectoRow[], obras: ObraRow[]): TuplaCruce[] {
  return tuplas.sort(
    (a, b) =>
      b.matchScore - a.matchScore ||
      proyectos[a.proyectoIdx].pley_num - proyectos[b.proyectoIdx].pley_num ||
      obras[a.obraIdx].codigo_infobras.localeCompare(obras[b.obraIdx].codigo_infobras)
  );
}

function hidratar(
  tupla: TuplaCruce,
  proyectos: ProyectoRow[],
  obras: ObraRow[]
): CruceProyectoInfobrasResult {
  return {
    proyecto: mapProyecto(proyectos[tupla.proyectoIdx]),
    obra: mapObra(obras[tupla.obraIdx]),
    matchScore: tupla.matchScore,
    matchedKeywords: tupla.matchedKeywords,
  };
}

export interface OpcionesCruce {
  umbralScore?: number;
  matchedMinimo?: number;
  limite?: number;
  offset?: number;
}

/**
 * Cruza proyectos de ley con obras INFOBRAS por departamento y periodo.
 *
 * Puntúa el conjunto completo y pagina sobre él: `total` es el conteo real, y
 * solo se hidratan los objetos de la página pedida.
 */
export async function cruzarProyectosInfobras(
  departamento: string,
  opciones: OpcionesCruce & { periodo?: number } = {}
): Promise<CruceResultado> {
  const {
    umbralScore = UMBRAL_SCORE_DEFAULT,
    matchedMinimo = MATCHED_MINIMO_DEFAULT,
    limite = 200,
    offset = 0,
    periodo = 2026,
  } = opciones;

  const { rows: proyectos } = await pool.query<ProyectoRow>(
    `SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores
     FROM legislativo_congreso_proyectos
     WHERE per_par_id = $1
     ORDER BY fecha_presentacion DESC NULLS LAST`,
    [periodo]
  );

  // El pool se resuelve antes del fast path de "nada que cruzar": si INFOBRAS no
  // está accesible la respuesta es 503 aunque el periodo no traiga proyectos con
  // keywords. Devolver 200 con total:0 ahí hacía indistinguible un periodo vacío
  // de un cruce degradado.
  const infobrasDb = requireCrossAppPool("infobras", process.env);

  const keywordsPorProyecto = proyectos.map((row) => extractKeywords(row.titulo));
  if (keywordsPorProyecto.every((k) => k.length === 0)) {
    return { total: 0, cruces: [], hasMore: false };
  }

  const indice = await cargarIndice(infobrasDb, departamento);
  const tuplas: TuplaCruce[] = [];
  for (let i = 0; i < proyectos.length; i++) {
    const keywords = keywordsPorProyecto[i];
    if (keywords.length === 0) continue;
    for (const match of puntuarProyecto(indice, keywords, { umbralMinimo: umbralScore, matchedMinimo })) {
      tuplas.push({
        proyectoIdx: i,
        obraIdx: match.obraIndex,
        matchScore: match.matched / keywords.length,
        matchedKeywords: match.keywords,
      });
    }
  }

  ordenarTuplas(tuplas, proyectos, indice.obras);
  const pagina = tuplas.slice(offset, offset + limite);
  return {
    total: tuplas.length,
    cruces: pagina.map((t) => hidratar(t, proyectos, indice.obras)),
    hasMore: offset + pagina.length < tuplas.length,
  };
}

/**
 * Cruce un proyecto específico con obras INFOBRAS.
 */
export async function cruzarProyectoInfobrasPorId(
  perParId: number,
  pleyNum: number,
  departamento: string,
  opciones: OpcionesCruce = {}
): Promise<CruceResultado> {
  const { umbralScore = UMBRAL_SCORE_DEFAULT, matchedMinimo = MATCHED_MINIMO_DEFAULT } = opciones;

  const { rows: proyectos } = await pool.query<ProyectoRow>(
    `SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores
     FROM legislativo_congreso_proyectos
     WHERE per_par_id = $1 AND pley_num = $2`,
    [perParId, pleyNum]
  );

  if (proyectos.length === 0) {
    return { total: 0, cruces: [], hasMore: false };
  }

  // El proyecto existe, así que este camino sí corresponde a un cruce: la
  // degradación se declara aunque su título no rinda keywords.
  const infobrasDb = requireCrossAppPool("infobras", process.env);

  const keywords = extractKeywords(proyectos[0].titulo);
  if (keywords.length === 0) {
    return { total: 0, cruces: [], hasMore: false };
  }

  const indice = await cargarIndice(infobrasDb, departamento);
  const tuplas: TuplaCruce[] = puntuarProyecto(indice, keywords, {
    umbralMinimo: umbralScore,
    matchedMinimo,
  }).map((m) => ({
    proyectoIdx: 0,
    obraIdx: m.obraIndex,
    matchScore: m.matched / keywords.length,
    matchedKeywords: m.keywords,
  }));

  ordenarTuplas(tuplas, proyectos, indice.obras);
  return {
    total: tuplas.length,
    cruces: tuplas.map((t) => hidratar(t, proyectos, indice.obras)),
    hasMore: false,
  };
}
/**
 * Cruce entre proyectos de ley y obras públicas (INFOBRAS).
 *
 * Estrategia:
 * 1. Extraer palabras clave del título de cada proyecto del periodo
 * 2. Una sola query a INFOBRAS: nombre_obra ILIKE '%kw%' OR ... AND departamento = filtro
 * 3. Score de match en memoria: keywords coincidentes / keywords del proyecto
 *
 * El cruce se hace con un único SELECT por departamento. Una query por proyecto
 * (N+1) sobre el periodo completo era inviable: el periodo 2026 tiene cientos de
 * proyectos y cada query cruzaba la red hacia la BD de INFOBRAS.
 */

import type { Pool } from "pg";
import { pool } from "../db/pool.js";
import { requireCrossAppPool } from "../lib/cross-app-pool.js";
import { calculateMatchScore, extractKeywords, findMatchedKeywords } from "../lib/keyword-matcher.js";

/** Tope de obras candidatas por departamento en la única query a INFOBRAS. */
const OBRAS_CANDIDATAS_LIMIT = 500;

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

const PROYECTO_SELECT = `
  SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores
  FROM legislativo_congreso_proyectos`;

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
 * Devuelve las obras candidatas de INFOBRAS para un conjunto de keywords con UN solo query.
 */
async function fetchObrasCandidatas(
  infobrasDb: Pool,
  departamento: string,
  keywords: string[]
): Promise<ObraRow[]> {
  const params: unknown[] = [departamento.toUpperCase()];
  const ilikeConditions = keywords.map((kw) => {
    params.push(`%${kw}%`);
    return `nombre_obra ILIKE $${params.length}`;
  });

  const { rows } = await infobrasDb.query<ObraRow>(
    `${OBRA_SELECT}
     WHERE departamento = $1 AND (${ilikeConditions.join(" OR ")})
     ORDER BY codigo_infobras
     LIMIT ${OBRAS_CANDIDATAS_LIMIT}`,
    params
  );

  return rows;
}

/**
 * Cruza proyectos de ley con obras INFOBRAS por departamento y periodo.
 */
export async function cruzarProyectosInfobras(
  departamento: string,
  umbralScore: number = 0.3,
  periodo: number = 2026
): Promise<CruceProyectoInfobrasResult[]> {
  const { rows: proyectos } = await pool.query<ProyectoRow>(
    `${PROYECTO_SELECT}
     WHERE per_par_id = $1
     ORDER BY fecha_presentacion DESC NULLS LAST`,
    [periodo]
  );

  const matcheables: ProyectoMatcheable[] = [];
  for (const row of proyectos) {
    const keywords = extractKeywords(row.titulo);
    if (keywords.length > 0) {
      matcheables.push({ row, keywords });
    }
  }

  if (matcheables.length === 0) {
    return [];
  }

  const infobrasDb = requireCrossAppPool("infobras", process.env);

  const todasKeywords = [...new Set(matcheables.flatMap((p) => p.keywords))];
  const obras = await fetchObrasCandidatas(infobrasDb, departamento, todasKeywords);

  const resultados: CruceProyectoInfobrasResult[] = [];
  for (const { row, keywords } of matcheables) {
    for (const obra of obras) {
      const matchScore = calculateMatchScore(keywords, obra.nombre_obra);
      if (matchScore >= umbralScore) {
        resultados.push({
          proyecto: mapProyecto(row),
          obra: mapObra(obra),
          matchScore,
          matchedKeywords: findMatchedKeywords(keywords, obra.nombre_obra),
        });
      }
    }
  }

  return resultados.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Cruce un proyecto específico con obras INFOBRAS.
 */
export async function cruzarProyectoInfobrasPorId(
  perParId: number,
  pleyNum: number,
  departamento: string,
  umbralScore: number = 0.3
): Promise<CruceProyectoInfobrasResult[]> {
  const { rows: proyectos } = await pool.query<ProyectoRow>(
    `${PROYECTO_SELECT}
     WHERE per_par_id = $1 AND pley_num = $2`,
    [perParId, pleyNum]
  );

  if (proyectos.length === 0) {
    return [];
  }

  const row = proyectos[0];
  const keywords = extractKeywords(row.titulo);
  if (keywords.length === 0) {
    return [];
  }

  const infobrasDb = requireCrossAppPool("infobras", process.env);
  const obras = await fetchObrasCandidatas(infobrasDb, departamento, keywords);

  const resultados: CruceProyectoInfobrasResult[] = [];
  for (const obra of obras) {
    const matchScore = calculateMatchScore(keywords, obra.nombre_obra);
    if (matchScore >= umbralScore) {
      resultados.push({
        proyecto: mapProyecto(row),
        obra: mapObra(obra),
        matchScore,
        matchedKeywords: findMatchedKeywords(keywords, obra.nombre_obra),
      });
    }
  }

  return resultados.sort((a, b) => b.matchScore - a.matchScore);
}
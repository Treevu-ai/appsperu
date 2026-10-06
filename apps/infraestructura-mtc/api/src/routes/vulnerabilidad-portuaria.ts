import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import {
  buildPuertoSeriesMap,
  computeVariacionScore,
  computeVolumenScore,
  matchTerminalToPuerto,
  type PuertoSeriesMap,
} from "../ingest/cargas-portuarias-join.js";
import {
  computeTbmlScore,
  computeTbmlScoresByAduana,
  matchTerminalToAduana,
  type AduanaTbmlScore,
  type ImportRow,
} from "../ingest/aduanas-tbml-join.js";
import {
  calcularScoreVulnerabilidad,
  calcularScoreVulnerabilidadTrafico,
  calcularScoreVulnerabilidadV3,
} from "../lib/vulnerabilidad-scoring.js";
import { requireCrossAppPool, CrossAppUnavailableError } from "../lib/cross-app-pool.js";

export { calcularScoreVulnerabilidad, calcularScoreVulnerabilidadTrafico, calcularScoreVulnerabilidadV3 };

/** Fuente que activa el enriquecimiento VUL-11/12 (join con cargas_portuarias_historico). Ver
 * cargas-portuarias-join.ts — distinto del "v2" de riesgo climático (`/vulnerabilidad/clima`). */
const FUENTE_TRAFICO = "MTC+CARGAS_2017";

/**
 * v3: extiende v2-tráfico con la dimensión TBML (SUNAT aduanas) y normalización OCDE. Ver
 * docs/indice-vulnerabilidad-v3-oecd-tbml.md. Requiere `SUNAT_ADUANAS_DATABASE_URL` — sin ella,
 * 503, no un v3 silenciosamente degradado a v2 (mismo criterio que usa legislativo-congreso para
 * su cruce con infobras).
 */
const FUENTE_V3 = "MTC+CARGAS+SUNAT_V3";

// ─── Tipos para datos ANA SNIRH ─────────────────────────────────────────────

export interface AnaEstacion {
  IDESTACIONCONFIG: number;
  IDESTACION: number;
  ESTACION: string;
  RIO: string;
  DEPARTAMENTO: string;
  PROVINCIA: string;
  DISTRITO: string;
  LONGITUD: string;
  LATITUD: string;
  VALOR: string;
  UALERTA: string;
  UEMERGENCIA: string;
  UNIDADMEDIDA: string;
  TENDENCIA: string;
  FLGPUNTOCRITICO: number;
  OPERADOR: string;
  REGIONHIDRO: string;
  RPT_PERIODO: string;
}

export interface RiesgoClimaticoResult {
  scoreClima: number;
  nivelRiesgo: "bajo" | "medio" | "alto" | "muy_alto";
  estacionCercana: {
    nombre: string;
    rio: string;
    departamento: string;
    distanciaKm: number;
  } | null;
  estadoCaudal: "normal" | "alerta" | "emergencia" | "sin_datos";
  tendencia: string | null;
  periodo: string;
  esPuntoCritico: boolean;
  fuente: string;
  fechaDatos: string;
}

/** Fila de `GET /api/terminales/vulnerabilidad/clima`: la parte estructural (V1) más la climática.
 *  Los campos climáticos se llenan en un segundo paso, cuando ya se resolvió el terminal más
 *  cercano por coordenadas — por eso arrancan en `null` y no son opcionales. */
interface FilaVulnerabilidadClima {
  ranking: number;
  codigoPuerto: string;
  nombreTerminal: string;
  idDepartamento: string;
  scoreV1: number;
  componentesV1: unknown;
  scoreClima: number | null;
  nivelRiesgoClima: RiesgoClimaticoResult["nivelRiesgo"] | null;
  scoreV2: number;
  estacionCercana: RiesgoClimaticoResult["estacionCercana"];
  estadoCaudal: RiesgoClimaticoResult["estadoCaudal"] | null;
  tendenciaCaudal: string | null;
  periodoHidrologico: string | null;
  esPuntoCritico: boolean | null;
}

export const vulnerabilidadRouter = Router();

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

// ─── Endpoint: GET /api/terminales/vulnerabilidad ─────────────────────────────

const QuerySchema = z.object({
  departamento: z.string().min(1).optional().describe("Código UBIGEO de departamento, ej. '13' para La Libertad."),
  ambito: z.string().min(1).optional().describe("Filtrar por ámbito: 'Marítimo', 'Fluvial', 'Lacustre'."),
  fuente: z.string().min(1).default("MTC_2025").describe("Fuente de datos para el índice."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

vulnerabilidadRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, ambito, fuente, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (departamento) {
      params.push(departamento);
      conditions.push(`iv.id_departamento = $${params.length}`);
    }
    if (ambito) {
      params.push(`%${ambito}%`);
      conditions.push(`iv.ambito ILIKE $${params.length}`);
    }
    if (fuente) {
      params.push(fuente);
      conditions.push(`iv.fuente_datos = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Contar total
    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM indice_vulnerabilidad_portuaria iv ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    // Obtener resultados con ranking
    const { rows } = await pool.query(
      `SELECT
         iv.*,
         ROW_NUMBER() OVER (ORDER BY iv.score_vulnerabilidad DESC) AS ranking
       FROM indice_vulnerabilidad_portuaria iv
       ${where}
       ORDER BY iv.score_vulnerabilidad DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      fuente: fuente,
      resultados: rows.map((r) => ({
        ranking: Number(r.ranking),
        codigoPuerto: r.codigo_puerto,
        nombreTerminal: r.nombre_terminal,
        idDepartamento: r.id_departamento,
        departamento: r.departamento,
        ambito: r.ambito,
        alcance: r.alcance,
        estadoConservacion: r.estado_conservacion,
        esConcesionado: r.es_concesionado,
        tieneGeolocalizacion: r.tiene_geolocalizacion,
        scoreVulnerabilidad: Number(r.score_vulnerabilidad),
        componentes: r.componentes,
        fuenteDatos: r.fuente_datos,
        calculadoEn: r.calculado_en,
      })),
    });
  })
);

// ─── Endpoint: GET /api/terminales/vulnerabilidad/:codigo ─────────────────────

vulnerabilidadRouter.get(
  "/:codigo",
  asyncHandler(async (req, res) => {
    const { codigo } = req.params;
    // Mismo default que el endpoint de listado (`GET /`) — sin esto, un terminal con más de
    // una fuente publicada (v1 + v2 + v3 coexistiendo) devolvía `rows[0]` sin ORDER BY, es
    // decir, cualquiera de las fuentes de forma no determinística. Hallazgo real verificado en
    // vivo 2026-10-05: tras calcular v3 localmente, este endpoint empezó a devolver el score v3
    // para terminales donde antes devolvía v1, sin que el caller pidiera v3 explícitamente.
    const fuente = typeof req.query.fuente === "string" ? req.query.fuente : "MTC_2025";

    const { rows } = await pool.query(
      `SELECT * FROM indice_vulnerabilidad_portuaria WHERE codigo_puerto = $1 AND fuente_datos = $2`,
      [codigo, fuente]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: `No se encontró índice para el código '${codigo}'.` });
      return;
    }

    const r = rows[0];

    // Obtener ranking global
    const { rows: rankRows } = await pool.query<{ ranking: string }>(
      `SELECT COUNT(*) + 1 AS ranking
       FROM indice_vulnerabilidad_portuaria
       WHERE score_vulnerabilidad > $1
         AND fuente_datos = $2`,
      [r.score_vulnerabilidad, r.fuente_datos]
    );

    res.json({
      codigoPuerto: r.codigo_puerto,
      nombreTerminal: r.nombre_terminal,
      idDepartamento: r.id_departamento,
      departamento: r.departamento,
      ambito: r.ambito,
      alcance: r.alcance,
      estadoConservacion: r.estado_conservacion,
      esConcesionado: r.es_concesionado,
      tieneGeolocalizacion: r.tiene_geolocalizacion,
      scoreVulnerabilidad: Number(r.score_vulnerabilidad),
      componentes: r.componentes,
      ranking: Number(rankRows[0]?.ranking ?? 1),
      totalTerminales: null, // Se puede agregar si se requiere
      fuenteDatos: r.fuente_datos,
      calculadoEn: r.calculado_en,
    });
  })
);

// ─── Scoring riesgo climatico (v2) ──────────────────────────────────────────────

/**
 * Distancia en km entre dos puntos lat/lon (formula de Haversine).
 */
function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Parsea valor numerico de cadena (maneja espacios, "s.d.", N/A).
 */
function parseValor(val: string): number | null {
  const cleaned = val.trim();
  if (!cleaned || cleaned === "s.d." || cleaned === "N/A" || cleaned === "n/d") return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Determina el nivel de alerta de una estacion segun valor vs umbrales.
 * En estiaje (meses 8-10): alerta si valor < umbral naranja
 * En crecida (meses 1-4, 12): alerta si valor > umbral naranja
 */
function nivelAlerta(
  valor: number | null,
  uAlerta: number | null,
  uEmergencia: number | null,
  periodo: string,
  mesActual: number
): "normal" | "alerta" | "emergencia" {
  if (valor === null || uAlerta === null || uAlerta === 0) return "normal";

  const esEstiaje = [8, 9, 10].includes(mesActual);
  const esCrecida = [1, 2, 3, 4, 12].includes(mesActual);

  if (esEstiaje) {
    // En estiaje: rojo si bajo del umbral de emergencia, naranja si bajo del umbral de alerta
    if (uEmergencia !== null && uEmergencia > 0 && valor < uEmergencia) return "emergencia";
    if (valor < uAlerta) return "alerta";
  } else if (esCrecida || periodo.includes("CRECIDA")) {
    // En crecida: rojo si sobre umbral de emergencia, naranja si sobre umbral de alerta
    if (uEmergencia !== null && uEmergencia > 0 && valor > uEmergencia) return "emergencia";
    if (valor > uAlerta) return "alerta";
  } else {
    // Transicion: similar a crecida
    if (uEmergencia !== null && uEmergencia > 0 && valor > uEmergencia) return "emergencia";
    if (valor > uAlerta) return "alerta";
  }

  return "normal";
}

/**
 * Calcula el score de riesgo climatico para un terminal portuario.
 * Utiliza datos del ANA SNIRH (caudales en tiempo real).
 *
 * Score maximo = 40 puntos (≈ 40% del indice v2).
 * Se suma al score v1 para obtener el score v2 total.
 */
export function calcularRiesgoClimatico(params: {
  latitud: number | null;
  longitud: number | null;
  departamento: string | null; // codigo UBIGEO
  estacionesAna: AnaEstacion[];
  fechaDatos: string; // "DD/MM/YYYY"
}): RiesgoClimaticoResult {
  const { latitud, longitud, estacionesAna, fechaDatos } = params;

  // Default: riesgo bajo
  let scoreClima = 0;
  let nivelRiesgo: RiesgoClimaticoResult["nivelRiesgo"] = "bajo";
  let estacionCercana: RiesgoClimaticoResult["estacionCercana"] = null;
  let estadoCaudal: RiesgoClimaticoResult["estadoCaudal"] = "sin_datos";
  let tendencia: string | null = null;
  let esPuntoCritico = false;

  const periodoActual = estacionesAna[0]?.RPT_PERIODO ?? "ESTIAJE";
  const mesActual = parseInt(fechaDatos.split("/")[1]) || 9;

  // Departamentos amazonicos con riesgohidrico alto
  const depsAmazonicos = new Set([
    "LORETO", "UCAYALI", "MADRE DE DIOS", "AMAZONAS", "SAN MARTIN"
  ]);

  // Si el puerto no tiene geo, asignar riesgo medio-alto por departamento amazonico
  if (latitud === null || longitud === null) {
    const dep = params.departamento?.toUpperCase() ?? "";
    if (depsAmazonicos.has(dep)) {
      scoreClima = 25;
      nivelRiesgo = "alto";
      estadoCaudal = "sin_datos";
    } else {
      scoreClima = 10;
      nivelRiesgo = "medio";
    }
    return {
      scoreClima,
      nivelRiesgo,
      estacionCercana: null,
      estadoCaudal,
      tendencia: null,
      periodo: periodoActual,
      esPuntoCritico: false,
      fuente: "ANA_SNIRH",
      fechaDatos,
    };
  }

  // Buscar estacion mas cercana con coordenadas validas
  let mejorEstacion: AnaEstacion | null = null;
  let menorDistancia = Infinity;

  for (const est of estacionesAna) {
    const latEst = parseFloat(est.LATITUD.trim());
    const lonEst = parseFloat(est.LONGITUD.trim());
    if (isNaN(latEst) || isNaN(lonEst)) continue;

    const dist = distanciaKm(latitud, longitud, latEst, lonEst);
    if (dist < menorDistancia) {
      menorDistancia = dist;
      mejorEstacion = est;
    }
  }

  // Si no hay ninguna estacion con geo, riesgo bajo
  if (!mejorEstacion) {
    return {
      scoreClima: 5,
      nivelRiesgo: "bajo",
      estacionCercana: null,
      estadoCaudal: "normal",
      tendencia: null,
      periodo: periodoActual,
      esPuntoCritico: false,
      fuente: "ANA_SNIRH",
      fechaDatos,
    };
  }

  // Distancia maxima para considerar relevante: 100km
  if (menorDistancia > 100) {
    return {
      scoreClima: 5,
      nivelRiesgo: "bajo",
      estacionCercana: {
        nombre: mejorEstacion.ESTACION,
        rio: mejorEstacion.RIO,
        departamento: mejorEstacion.DEPARTAMENTO,
        distanciaKm: Math.round(menorDistancia),
      },
      estadoCaudal: "normal",
      tendencia: null,
      periodo: periodoActual,
      esPuntoCritico: false,
      fuente: "ANA_SNIRH",
      fechaDatos,
    };
  }

  // Calcular riesgo segun la estacion cercana
  const valor = parseValor(mejorEstacion.VALOR);
  const uAlerta = parseValor(mejorEstacion.UALERTA);
  const uEmergencia = parseValor(mejorEstacion.UEMERGENCIA);
  esPuntoCritico = mejorEstacion.FLGPUNTOCRITICO === 1;
  tendencia = mejorEstacion.TENDENCIA.trim() || null;

  estadoCaudal = nivelAlerta(valor, uAlerta, uEmergencia, periodoActual, mesActual);

  // Scoring base por distancia (0-15 pts)
  if (menorDistancia <= 10) scoreClima += 15;
  else if (menorDistancia <= 30) scoreClima += 10;
  else if (menorDistancia <= 60) scoreClima += 5;
  else scoreClima += 2;

  // Scoring por estado de caudal (0-15 pts)
  if (estadoCaudal === "emergencia") scoreClima += 15;
  else if (estadoCaudal === "alerta") scoreClima += 8;

  // Scoring por punto critico (0-10 pts)
  if (esPuntoCritico) scoreClima += 10;

  // Scoring por tendencia ascendente en meses de crecida (0-5 pts)
  if (
    tendencia?.toLowerCase().includes("ascendente") &&
    [1, 2, 3, 4, 12].includes(mesActual)
  ) {
    scoreClima += 5;
  }

  // Scoring por region amazonica sin geo (0-5 pts)
  const dep = params.departamento?.toUpperCase() ?? "";
  if (depsAmazonicos.has(dep)) scoreClima += 5;

  // Limitar a 40 pts maximo
  scoreClima = Math.min(scoreClima, 40);

  // Clasificar nivel
  if (scoreClima >= 25) nivelRiesgo = "muy_alto";
  else if (scoreClima >= 15) nivelRiesgo = "alto";
  else if (scoreClima >= 5) nivelRiesgo = "medio";
  else nivelRiesgo = "bajo";

  estacionCercana = {
    nombre: mejorEstacion.ESTACION,
    rio: mejorEstacion.RIO,
    departamento: mejorEstacion.DEPARTAMENTO,
    distanciaKm: Math.round(menorDistancia),
  };

  return {
    scoreClima,
    nivelRiesgo,
    estacionCercana,
    estadoCaudal,
    tendencia,
    periodo: periodoActual,
    esPuntoCritico,
    fuente: "ANA_SNIRH",
    fechaDatos,
  };
}
// Recalcula el índice desde el inventario actual del MTC

vulnerabilidadRouter.post(
  "/calcular",
  asyncHandler(async (req, res) => {
    const { fuente } = req.body?.fuente ? { fuente: req.body.fuente } : { fuente: "MTC_2025" };
    const esV3 = fuente === FUENTE_V3;
    const esTrafico = fuente === FUENTE_TRAFICO || esV3; // v3 extiende v2: necesita la misma serie de tráfico

    // Obtener todos los terminales del corte más reciente
    const { rows: terminales } = await pool.query(
      `SELECT
         t.codigo_puerto,
         t.nombre_terminal,
         t.label_terminal,
         t.id_departamento,
         t.ambito,
         t.alcance,
         t.estado_conservacion,
         t.es_concesionado,
         t.latitud,
         t.longitud,
         t.fecha_corte
       FROM terminales_portuarios t
       WHERE t.fecha_corte = (SELECT MAX(fecha_corte) FROM terminales_portuarios)`
    );

    // Para la fuente de tráfico, precargar las series de volumen por puerto (VUL-11).
    let seriesPorPuerto: PuertoSeriesMap = new Map();
    let puertosDisponibles: string[] = [];
    if (esTrafico) {
      const { rows: cargasRows } = await pool.query<{ nombre_fuente: string; anio: number; volumen_tm: string }>(
        `SELECT nombre_fuente, anio, volumen_tm FROM cargas_portuarias_historico WHERE nivel = 'puerto'`
      );
      seriesPorPuerto = buildPuertoSeriesMap(
        cargasRows.map((r) => ({ nombreFuente: r.nombre_fuente, anio: r.anio, volumenTm: Number(r.volumen_tm) }))
      );
      puertosDisponibles = [...seriesPorPuerto.keys()];

      // Sin datos de tráfico cargados (ej. base recién migrada, antes de correr
      // ingest:cargas-portuarias), este recálculo degeneraría silenciosamente en puro v1
      // etiquetado como 'MTC+CARGAS_2017' — hallazgo real de Copilot en PR #232. No basta con
      // "algún año": computeVolumenScore usa específicamente serie[2017] (hallazgo real de
      // CodeRabbit en la misma PR) — datos de otros años sin 2017 producirían el mismo
      // degenere silencioso.
      const tieneDato2017 = [...seriesPorPuerto.values()].some((serie) => serie[2017] !== undefined);
      if (puertosDisponibles.length === 0 || !tieneDato2017) {
        res.status(409).json({
          error: `No hay datos de 2017 en cargas_portuarias_historico para calcular '${fuente}'. Corre primero 'npm run ingest:cargas-portuarias'.`,
        });
        return;
      }
    }

    // Para v3, precargar además los scores TBML por aduana (VUL-17/18/19) desde sunat-aduanas.
    // 503 si la app cruzada no está configurada — nunca un v3 degradado a v2 en silencio.
    let tbmlPorAduana: Map<string, AduanaTbmlScore> = new Map();
    let aduanasDisponibles: string[] = [];
    if (esV3) {
      let sunatAduanasDb;
      try {
        sunatAduanasDb = requireCrossAppPool("sunat_aduanas", process.env);
      } catch (err) {
        if (err instanceof CrossAppUnavailableError) {
          res.status(503).json({ error: "Cruce no disponible", detalle: "SUNAT-ADUANAS no está accesible" });
          return;
        }
        throw err;
      }

      const { rows: importRows } = await sunatAduanasDb.query<{
        aduana_code: number;
        aduana_name: string;
        year: number;
        subpartida: string;
        value_fob_usd: string;
        value_cif_usd: string;
      }>(`SELECT aduana_code, aduana_name, year, subpartida, value_fob_usd, value_cif_usd FROM port_subpartida_imports`);

      const importsParaScore: ImportRow[] = importRows.map((r) => ({
        aduanaCode: r.aduana_code,
        aduanaName: r.aduana_name,
        year: r.year,
        subpartida: r.subpartida,
        fobUsd: Number(r.value_fob_usd),
        cifUsd: Number(r.value_cif_usd),
      }));

      tbmlPorAduana = computeTbmlScoresByAduana(importsParaScore);
      aduanasDisponibles = [...new Set(importRows.map((r) => r.aduana_name))];

      // Sin filas de SUNAT, o sin ningún grupo (subpartida, año) con suficientes aduanas
      // para una mediana robusta, el recálculo degeneraría en v3 con tbmlScore:null en todos
      // los terminales — mismo riesgo de "degradación silenciosa" que el guard de tráfico de
      // arriba. pctValorAnomalo === 0 en una aduana SÍ es un resultado legítimo (cero anomalías
      // detectadas, no ausencia de datos), así que no se rechaza por eso — solo por ausencia
      // total de datos o de benchmark.
      if (importRows.length === 0 || tbmlPorAduana.size === 0) {
        res.status(409).json({
          error: `No hay datos de SUNAT-aduanas benchmarkeables para calcular '${fuente}'. Verifica que 'port_subpartida_imports' tenga filas y suficientes aduanas por subpartida.`,
        });
        return;
      }
    }

    // Limpiar índice existente para esta fuente
    await pool.query(
      `DELETE FROM indice_vulnerabilidad_portuaria WHERE fuente_datos = $1`,
      [fuente]
    );

    // Calcular e insertar scores
    let insertados = 0;
    let terminalesConCoberturaTrafico = 0;
    let terminalesConCoberturaTbml = 0;
    const errores: string[] = [];

    for (const t of terminales) {
      const tieneGeo = t.latitud !== null && t.longitud !== null;

      let score: number;
      let componentes: Record<string, unknown>;

      if (esV3) {
        const puertoMatch = matchTerminalToPuerto(t.nombre_terminal, t.label_terminal, puertosDisponibles);
        const serie = puertoMatch ? seriesPorPuerto.get(puertoMatch) ?? null : null;
        if (puertoMatch) terminalesConCoberturaTrafico++;

        const aduanaMatch = matchTerminalToAduana(t.nombre_terminal, t.label_terminal, aduanasDisponibles);
        const tbmlScore = aduanaMatch ? computeTbmlScore(tbmlPorAduana.get(aduanaMatch) ?? null) : null;
        if (aduanaMatch && tbmlScore !== null) terminalesConCoberturaTbml++;

        const resultado = calcularScoreVulnerabilidadV3({
          estadoConservacion: t.estado_conservacion,
          esConcesionado: t.es_concesionado,
          alcance: t.alcance,
          ambito: t.ambito,
          tieneGeolocalizacion: tieneGeo,
          volumenScore: computeVolumenScore(serie?.[2017] ?? null),
          variacionScore: computeVariacionScore(serie),
          tbmlScore,
        });
        score = resultado.score;
        componentes = { ...resultado.componentes, puertoMatch, aduanaMatch };
      } else if (esTrafico) {
        const puertoMatch = matchTerminalToPuerto(t.nombre_terminal, t.label_terminal, puertosDisponibles);
        const serie = puertoMatch ? seriesPorPuerto.get(puertoMatch) ?? null : null;
        if (puertoMatch) terminalesConCoberturaTrafico++;

        const resultado = calcularScoreVulnerabilidadTrafico({
          estadoConservacion: t.estado_conservacion,
          esConcesionado: t.es_concesionado,
          alcance: t.alcance,
          ambito: t.ambito,
          tieneGeolocalizacion: tieneGeo,
          volumenScore: computeVolumenScore(serie?.[2017] ?? null),
          variacionScore: computeVariacionScore(serie),
        });
        score = resultado.score;
        componentes = { ...resultado.componentes, puertoMatch };
      } else {
        const resultado = calcularScoreVulnerabilidad({
          estadoConservacion: t.estado_conservacion,
          esConcesionado: t.es_concesionado,
          alcance: t.alcance,
          ambito: t.ambito,
          tieneGeolocalizacion: tieneGeo,
        });
        score = resultado.score;
        componentes = resultado.componentes;
      }

      try {
        await pool.query(
          `INSERT INTO indice_vulnerabilidad_portuaria
             (codigo_puerto, nombre_terminal, id_departamento, departamento,
              ambito, alcance, estado_conservacion, es_concesionado,
              tiene_geolocalizacion, score_vulnerabilidad, componentes,
              fuente_datos, fecha_corte)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (codigo_puerto, fuente_datos) DO UPDATE SET
             nombre_terminal = EXCLUDED.nombre_terminal,
             id_departamento = EXCLUDED.id_departamento,
             departamento = EXCLUDED.departamento,
             ambito = EXCLUDED.ambito,
             alcance = EXCLUDED.alcance,
             estado_conservacion = EXCLUDED.estado_conservacion,
             es_concesionado = EXCLUDED.es_concesionado,
             tiene_geolocalizacion = EXCLUDED.tiene_geolocalizacion,
             score_vulnerabilidad = EXCLUDED.score_vulnerabilidad,
             componentes = EXCLUDED.componentes,
             fecha_corte = EXCLUDED.fecha_corte,
             calculado_en = CURRENT_DATE`,
          [
            t.codigo_puerto,
            t.nombre_terminal,
            t.id_departamento,
            null, // departamento (nombre) - requiere tabla de lookup
            t.ambito,
            t.alcance,
            t.estado_conservacion,
            t.es_concesionado,
            tieneGeo,
            score,
            JSON.stringify(componentes),
            fuente,
            t.fecha_corte,
          ]
        );
        insertados++;
      } catch (err) {
        errores.push(`${t.codigo_puerto}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    res.json({
      mensaje: `Índice de vulnerabilidad recalculado`,
      fuente,
      terminalesProcesados: terminales.length,
      insertados,
      coberturaTrafico: esTrafico
        ? { terminalesConMatch: terminalesConCoberturaTrafico, total: terminales.length }
        : undefined,
      coberturaTbml: esV3
        ? { terminalesConMatch: terminalesConCoberturaTbml, total: terminales.length }
        : undefined,
      errores: errores.length > 0 ? errores : undefined,
    });
  })
);

// ─── Cache simple en memoria para datos ANA (5 min TTL) ────────────────────────

let anaCache: { data: AnaEstacion[]; fecha: string; fetchedAt: number } | null = null;
const ANA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function fetchDatosAna(fecha: string): Promise<{ estaciones: AnaEstacion[]; fecha: string }> {
  // Usar cache si es reciente
  if (anaCache && Date.now() - anaCache.fetchedAt < ANA_CACHE_TTL_MS) {
    return { estaciones: anaCache.data, fecha: anaCache.fecha };
  }

  // Llamada real al ANA SNIRH
  const url = "https://snirh.ana.gob.pe/onrh/ServicioReportes.asmx/ReporteNacionalCaudal";
  const body = JSON.stringify({
    pTipoRPT: 1,
    pFecha: fecha,
    pCodAAA: "00",
    pCodALA: "00",
    pCodUbigeo: "00",
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": "Mozilla/5.0" },
    body,
    signal: AbortSignal.timeout(20_000), // 20s timeout
  });

  if (!response.ok) {
    throw new Error(`ANA SNIRH respondio ${response.status}: ${response.statusText}`);
  }

  const json = await response.json() as { d: AnaEstacion[] };
  anaCache = { data: json.d, fecha, fetchedAt: Date.now() };

  return { estaciones: json.d, fecha };
}

// ─── Endpoint: GET /api/terminales/vulnerabilidad/clima ────────────────────────
// Devuelve el indice v2: vulnerabilidad estructural + riesgo climatico
// Llama al ANA SNIRH en tiempo real

const ClimaQuerySchema = z.object({
  departamento: z.string().min(1).optional().describe("Codigo UBIGEO."),
  ambito: z.string().min(1).optional().describe("Filtrar por ambito."),
  fecha: z.string().optional().describe("Fecha de datos ANA (DD/MM/YYYY). Default: hoy."),
  fuente: z.string().min(1).default("MTC_2025"),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  offset: z.coerce.number().int().min(0).default(0),
});

vulnerabilidadRouter.get(
  "/clima",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ClimaQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, ambito, fecha, fuente, limit, offset } = parsed;

    // Fecha default: hoy
    const fechaAna = fecha ?? (() => {
      const d = new Date();
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    })();

    // Obtener estaciones del ANA
    let estacionesAna: AnaEstacion[] = [];
    let anaFetchedAt: string | null = null;
    try {
      const { estaciones, fecha: fechaResp } = await fetchDatosAna(fechaAna);
      estacionesAna = estaciones;
      anaFetchedAt = fechaResp;
    } catch (err) {
      console.warn("[v2/clima] No se pudo obtener datos ANA:", err instanceof Error ? err.message : String(err));
      // Continuar sin datos ANA (score climatico bajo)
    }

    // Obtener terminales del indice v1 existente
    const conditions: string[] = [`iv.fuente_datos = $1`];
    const params: unknown[] = [fuente];

    if (departamento) {
      params.push(departamento);
      conditions.push(`iv.id_departamento = $${params.length}`);
    }
    if (ambito) {
      params.push(`%${ambito}%`);
      conditions.push(`iv.ambito ILIKE $${params.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    // Contar
    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM indice_vulnerabilidad_portuaria iv ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    // Obtener terminales
    const { rows: terminales } = await pool.query(
      `SELECT
         iv.*,
         ROW_NUMBER() OVER (ORDER BY iv.score_vulnerabilidad DESC) AS ranking
       FROM indice_vulnerabilidad_portuaria iv
       ${where}
       ORDER BY iv.score_vulnerabilidad DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    // Calcular score v2 para cada terminal
    const resultados: FilaVulnerabilidadClima[] = terminales.map((t) => {
      // Obtener lat/lon del inventario original
      // Para esto necesitamos un join con terminales_portuarios
      // Ya que el indice guarda id_departamento pero no las coords
      // Usamos el JSON de componentes + id_departamento para lookup
      return {
        ranking: Number(t.ranking),
        codigoPuerto: t.codigo_puerto,
        nombreTerminal: t.nombre_terminal,
        idDepartamento: t.id_departamento,
        scoreV1: Number(t.score_vulnerabilidad),
        componentesV1: t.componentes,
        scoreClima: null,
        nivelRiesgoClima: null,
        scoreV2: Number(t.score_vulnerabilidad),
        estacionCercana: null,
        estadoCaudal: null,
        tendenciaCaudal: null,
        periodoHidrologico: null,
        esPuntoCritico: null,
      };
    });

    // Obtener coords de los puertos
    const codigos = resultados.map((r) => r.codigoPuerto);
    if (codigos.length > 0) {
      const { rows: puertos } = await pool.query(
        `SELECT codigo_puerto, latitud, longitud FROM terminales_portuarios
         WHERE codigo_puerto = ANY($1)
           AND fecha_corte = (SELECT MAX(fecha_corte) FROM terminales_portuarios)`,
        [codigos]
      );
      const coordMap = new Map(puertos.map((p: { codigo_puerto: string; latitud: number | null; longitud: number | null }) =>
        [p.codigo_puerto, { lat: p.latitud, lon: p.longitud }]));

      for (const r of resultados) {
        const coords = coordMap.get(r.codigoPuerto);
        const clima = calcularRiesgoClimatico({
          latitud: coords?.lat ?? null,
          longitud: coords?.lon ?? null,
          departamento: r.idDepartamento,
          estacionesAna,
          fechaDatos: fechaAna,
        });
        r.scoreClima = clima.scoreClima;
        r.nivelRiesgoClima = clima.nivelRiesgo;
        r.scoreV2 = Math.round((r.scoreV1 + clima.scoreClima) * 100) / 100;
        r.estacionCercana = clima.estacionCercana;
        r.estadoCaudal = clima.estadoCaudal;
        r.tendenciaCaudal = clima.tendencia;
        r.periodoHidrologico = clima.periodo;
        r.esPuntoCritico = clima.esPuntoCritico;
      }
    }

    // Re-ordenar por scoreV2
    resultados.sort((a: { scoreV2: number }, b: { scoreV2: number }) => b.scoreV2 - a.scoreV2);
    resultados.forEach((r: { ranking: number }, i: number) => { r.ranking = i + 1 + offset; });

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + resultados.length < total,
      fuente,
      datosAna: anaFetchedAt ? {
        fuente: "ANA_SNIRH",
        fecha: anaFetchedAt,
        estacionesCount: estacionesAna.length,
        periodo: estacionesAna[0]?.RPT_PERIODO ?? "desconocido",
      } : {
        fuente: "ANA_SNIRH",
        fecha: null,
        estacionesCount: 0,
        periodo: "sin_datos",
        error: "No se pudo obtener datos del ANA. Riesgo climatico calculado sin datos de caudal.",
      },
      resultados,
    });
  })
);

import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

interface IndiceRow extends NeonRow {
  codigo_puerto: string;
  nombre_terminal: string;
  id_departamento: string;
  departamento: string | null;
  ambito: string;
  alcance: string;
  estado_conservacion: string;
  es_concesionado: boolean | null;
  tiene_geolocalizacion: boolean;
  score_vulnerabilidad: number | string;
  componentes: unknown;
  fuente_datos: string;
  calculado_en: string;
}

/**
 * Handler para `infraestructura_mtc_terminales_vulnerabilidad` — GET /api/terminales/vulnerabilidad.
 *
 * SQL idéntico a `apps/infraestructura-mtc/api/src/routes/vulnerabilidad-portuaria.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const ambito = args.ambito as string | undefined;
  const fuente = (args.fuente as string | undefined) ?? "MTC_2025";
  const limit = args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT;
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

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

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM indice_vulnerabilidad_portuaria iv ${where}`,
    params,
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<IndiceRow & { ranking: number | string }>(
    `SELECT
       iv.*,
       ROW_NUMBER() OVER (ORDER BY iv.score_vulnerabilidad DESC) AS ranking
     FROM indice_vulnerabilidad_portuaria iv
     ${where}
     ORDER BY iv.score_vulnerabilidad DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      fuente,
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
    },
  };
}

/**
 * Handler para `infraestructura_mtc_terminal_vulnerabilidad` — GET /api/terminales/vulnerabilidad/{codigo}.
 */
export async function byCodigo(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const codigo = args.codigo as string;
  const fuente = args.fuente as string | undefined;

  const params: unknown[] = [codigo];
  let query = `SELECT * FROM indice_vulnerabilidad_portuaria WHERE codigo_puerto = $1`;

  if (fuente) {
    params.push(fuente);
    query += ` AND fuente_datos = $${params.length}`;
  }

  const { rows } = await db.query<IndiceRow>(query, params);

  if (rows.length === 0) {
    return { status: 404, body: { error: `No se encontró índice para el código '${codigo}'.` } };
  }

  const r = rows[0];

  const { rows: rankRows } = await db.query<{ ranking: string }>(
    `SELECT COUNT(*) + 1 AS ranking
     FROM indice_vulnerabilidad_portuaria
     WHERE score_vulnerabilidad > $1
       AND fuente_datos = $2`,
    [r.score_vulnerabilidad, r.fuente_datos],
  );

  return {
    status: 200,
    body: {
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
      totalTerminales: null,
      fuenteDatos: r.fuente_datos,
      calculadoEn: r.calculado_en,
    },
  };
}

// ─── Score climático v2 — mismas funciones puras de vulnerabilidad-portuaria.ts ──

interface AnaEstacion {
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

interface RiesgoClimaticoResult {
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

function parseValor(val: string): number | null {
  const cleaned = val.trim();
  if (!cleaned || cleaned === "s.d." || cleaned === "N/A" || cleaned === "n/d") return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function nivelAlerta(
  valor: number | null,
  uAlerta: number | null,
  uEmergencia: number | null,
  periodo: string,
  mesActual: number,
): "normal" | "alerta" | "emergencia" {
  if (valor === null || uAlerta === null || uAlerta === 0) return "normal";

  const esEstiaje = [8, 9, 10].includes(mesActual);
  const esCrecida = [1, 2, 3, 4, 12].includes(mesActual);

  if (esEstiaje) {
    if (uEmergencia !== null && uEmergencia > 0 && valor < uEmergencia) return "emergencia";
    if (valor < uAlerta) return "alerta";
  } else if (esCrecida || periodo.includes("CRECIDA")) {
    if (uEmergencia !== null && uEmergencia > 0 && valor > uEmergencia) return "emergencia";
    if (valor > uAlerta) return "alerta";
  } else {
    if (uEmergencia !== null && uEmergencia > 0 && valor > uEmergencia) return "emergencia";
    if (valor > uAlerta) return "alerta";
  }

  return "normal";
}

function calcularRiesgoClimatico(params: {
  latitud: number | null;
  longitud: number | null;
  departamento: string | null;
  estacionesAna: AnaEstacion[];
  fechaDatos: string;
}): RiesgoClimaticoResult {
  const { latitud, longitud, estacionesAna, fechaDatos } = params;

  let scoreClima = 0;
  let nivelRiesgo: RiesgoClimaticoResult["nivelRiesgo"] = "bajo";
  let estacionCercana: RiesgoClimaticoResult["estacionCercana"] = null;
  let estadoCaudal: RiesgoClimaticoResult["estadoCaudal"] = "sin_datos";
  let tendencia: string | null = null;
  let esPuntoCritico = false;

  const periodoActual = estacionesAna[0]?.RPT_PERIODO ?? "ESTIAJE";
  const mesActual = parseInt(fechaDatos.split("/")[1]) || 9;

  const depsAmazonicos = new Set(["LORETO", "UCAYALI", "MADRE DE DIOS", "AMAZONAS", "SAN MARTIN"]);

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

  const valor = parseValor(mejorEstacion.VALOR);
  const uAlerta = parseValor(mejorEstacion.UALERTA);
  const uEmergencia = parseValor(mejorEstacion.UEMERGENCIA);
  esPuntoCritico = mejorEstacion.FLGPUNTOCRITICO === 1;
  tendencia = mejorEstacion.TENDENCIA.trim() || null;

  estadoCaudal = nivelAlerta(valor, uAlerta, uEmergencia, periodoActual, mesActual);

  if (menorDistancia <= 10) scoreClima += 15;
  else if (menorDistancia <= 30) scoreClima += 10;
  else if (menorDistancia <= 60) scoreClima += 5;
  else scoreClima += 2;

  if (estadoCaudal === "emergencia") scoreClima += 15;
  else if (estadoCaudal === "alerta") scoreClima += 8;

  if (esPuntoCritico) scoreClima += 10;

  if (
    tendencia?.toLowerCase().includes("ascendente") &&
    [1, 2, 3, 4, 12].includes(mesActual)
  ) {
    scoreClima += 5;
  }

  const dep = params.departamento?.toUpperCase() ?? "";
  if (depsAmazonicos.has(dep)) scoreClima += 5;

  scoreClima = Math.min(scoreClima, 40);

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

// Cache en memoria (5 min TTL) — mismo patrón que la ruta Express; dura lo
// que dure el isolate del Worker, no es un caché persistente.
let anaCache: { data: AnaEstacion[]; fecha: string; fetchedAt: number } | null = null;
const ANA_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchDatosAna(fecha: string): Promise<{ estaciones: AnaEstacion[]; fecha: string }> {
  if (anaCache && Date.now() - anaCache.fetchedAt < ANA_CACHE_TTL_MS) {
    return { estaciones: anaCache.data, fecha: anaCache.fecha };
  }

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
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`ANA SNIRH respondio ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as { d: AnaEstacion[] };
  anaCache = { data: json.d, fecha, fetchedAt: Date.now() };

  return { estaciones: json.d, fecha };
}

/**
 * Handler para `infraestructura_mtc_terminales_vulnerabilidad_clima` — GET /api/terminales/vulnerabilidad/clima.
 *
 * SQL + lógica idénticos a `apps/infraestructura-mtc/api/src/routes/vulnerabilidad-portuaria.ts`
 * (endpoint `/clima`), incluyendo la llamada en vivo al ANA SNIRH — Workers soporta `fetch` global.
 */
export async function clima(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const ambito = args.ambito as string | undefined;
  const fechaArg = args.fecha as string | undefined;
  const fuente = (args.fuente as string | undefined) ?? "MTC_2025";
  const limit = args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT;
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const fechaAna =
    fechaArg ??
    (() => {
      const d = new Date();
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    })();

  let estacionesAna: AnaEstacion[] = [];
  let anaFetchedAt: string | null = null;
  try {
    const { estaciones, fecha: fechaResp } = await fetchDatosAna(fechaAna);
    estacionesAna = estaciones;
    anaFetchedAt = fechaResp;
  } catch (err) {
    console.warn("[vulnerabilidad/clima] No se pudo obtener datos ANA:", err instanceof Error ? err.message : String(err));
  }

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

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM indice_vulnerabilidad_portuaria iv ${where}`,
    params,
  );
  const total = Number(countRows[0].total);

  const { rows: terminales } = await db.query<IndiceRow & { ranking: number | string }>(
    `SELECT
       iv.*,
       ROW_NUMBER() OVER (ORDER BY iv.score_vulnerabilidad DESC) AS ranking
     FROM indice_vulnerabilidad_portuaria iv
     ${where}
     ORDER BY iv.score_vulnerabilidad DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  const resultados: FilaVulnerabilidadClima[] = terminales.map((t) => ({
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
  }));

  const codigos = resultados.map((r) => r.codigoPuerto);
  if (codigos.length > 0) {
    const { rows: puertos } = await db.query<{ codigo_puerto: string; latitud: number | string | null; longitud: number | string | null }>(
      `SELECT codigo_puerto, latitud, longitud FROM terminales_portuarios
       WHERE codigo_puerto = ANY($1)
         AND fecha_corte = (SELECT MAX(fecha_corte) FROM terminales_portuarios)`,
      [codigos],
    );
    const coordMap = new Map(
      puertos.map((p) => [p.codigo_puerto, { lat: p.latitud === null ? null : Number(p.latitud), lon: p.longitud === null ? null : Number(p.longitud) }]),
    );

    for (const r of resultados) {
      const coords = coordMap.get(r.codigoPuerto);
      const climaResult = calcularRiesgoClimatico({
        latitud: coords?.lat ?? null,
        longitud: coords?.lon ?? null,
        departamento: r.idDepartamento,
        estacionesAna,
        fechaDatos: fechaAna,
      });
      r.scoreClima = climaResult.scoreClima;
      r.nivelRiesgoClima = climaResult.nivelRiesgo;
      r.scoreV2 = Math.round((r.scoreV1 + climaResult.scoreClima) * 100) / 100;
      r.estacionCercana = climaResult.estacionCercana;
      r.estadoCaudal = climaResult.estadoCaudal;
      r.tendenciaCaudal = climaResult.tendencia;
      r.periodoHidrologico = climaResult.periodo;
      r.esPuntoCritico = climaResult.esPuntoCritico;
    }
  }

  resultados.sort((a, b) => b.scoreV2 - a.scoreV2);
  resultados.forEach((r, i) => {
    r.ranking = i + 1 + offset;
  });

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + resultados.length < total,
      fuente,
      datosAna: anaFetchedAt
        ? {
            fuente: "ANA_SNIRH",
            fecha: anaFetchedAt,
            estacionesCount: estacionesAna.length,
            periodo: estacionesAna[0]?.RPT_PERIODO ?? "desconocido",
          }
        : {
            fuente: "ANA_SNIRH",
            fecha: null,
            estacionesCount: 0,
            periodo: "sin_datos",
            error: "No se pudo obtener datos del ANA. Riesgo climatico calculado sin datos de caudal.",
          },
      resultados,
    },
  };
}

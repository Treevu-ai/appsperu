import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `bcrp_comercio_exterior_comtrade` — flujos de UN Comtrade
 * (benchmark externo), ingeridos por `src/ingest/comtrade-benchmark.ts`.
 *
 * No tiene ruta Express equivalente: la fuente se ingiere y se sirve solo por
 * MCP (ver `routes-vs-catalog.test.ts`, lista MCP_ONLY_PATHS). Escribe y lee en
 * la base de `bcrp-comercio-exterior` (dominio comercio exterior).
 *
 * Seis modos:
 * - default: filas filtradas (reporter × anio × flujo × partner × cmdCode),
 *   con `groupBy` opcional (partner | cmdCode | reporter | anio).
 * - `modo=rca`: ventaja comparativa revelada por capítulo arancelario —
 *   (exportaciones del país en el capítulo / total del país) /
 *   (exportaciones del Mundo en el capítulo / total del Mundo). El país son sus
 *   filas con partner_code = '0' (Mundo como destino = total del país); el Mundo
 *   es reporter_code = '0', el agregado mundial que ingerí el conector
 *   (suma de todos los reporters, flag --mundo). OJO: partner '0' NO son valores
 *   mundiales — verificado contra la API el 2026-10-15: reporter 604 × partner 0
 *   × cmd 04 = USD 59.6M, el valor de Perú, no el del mundo. RCA > 1 indica
 *   ventaja relativa.
 * - `modo=rca-serie`: la misma RCA para todos los años del rango (desde/hasta)
 *   en una sola llamada, con la tendencia por capítulo (alza/baja/estable según
 *   el delta extremo vs. UMBRAL_TENDENCIA_RCA).
 * - `modo=oportunidad`: capítulos con RCA < umbral (desventaja actual) pero
 *   demanda mundial al alza (CAGR de las importaciones mundiales del capítulo)
 *   — screening de líneas exportables donde el mercado crece y aún no somos
 *   fuertes.
 * - `modo=rca-bilateral` (requiere `anio` y `socio`): qué tan fuerte es el país
 *   EN el mercado del socio — la demanda de importación del socio (sus filas
 *   con flujo M y partner '0', ingeridas en el bloque --socios del conector)
 *   es el denominador del mercado destino. Trae tres métricas por capítulo.
 * - `modo=informe` (requiere `anio`): resumen ejecutivo en Markdown — totales,
 *   top RCA, mayores desventajas, tendencias y oportunidades.
 *
 * @fidelity: precomputado — este módulo NO es el port de ningún route Express:
 * la fuente (UN Comtrade) es nueva y se sirve solo por MCP, así que su SQL no
 * tiene origen del cual replicarse. Todas sus consultas son intencionalmente
 * nuevas y están declaradas una a una según el protocolo del test de fidelidad,
 * que verifica además que ninguna declaración sobre.
 */

interface ComtradeRow extends NeonRow {
  anio: number;
  flujo: string;
  reporter_code: string;
  partner_code: string;
  cmd_code: string;
  fob_usd: number | string | null;
  cif_usd: number | string | null;
  primary_usd: number | string | null;
  es_estimado: boolean;
  es_agregado: boolean;
}

const GROUP_BY_COLUMNAS: Record<string, string> = {
  partner: "partner_code",
  cmdCode: "cmd_code",
  cmd: "cmd_code",
  reporter: "reporter_code",
  anio: "anio",
  flujo: "flujo",
};

const FUENTE_COMTRADE =
  "UN Comtrade (comtradeapi.un.org, endpoint autenticado con COMTRADE_API_KEY; preview público sin key)";
const NOTA_INGESTA = "manual, sin scheduler — refleja la última corrida del conector";

/** Delta mínimo de RCA (fin - inicio) para declarar alza/baja; por debajo: estable. */
const UMBRAL_TENDENCIA_RCA = 0.25;

/** Nombres cortos de los capítulos HS que ingesta el conector (CMD_DEFAULT). */
const CAPITULOS_NOMBRES: Record<string, string> = {
  TOTAL: "Total",
  "01": "Animales vivos",
  "02": "Carnes y despojos",
  "04": "Lácteos, huevos y miel",
  "07": "Frutas y hortalizas",
  "08": "Café, té y especias finas",
  "09": "Especias",
  "10": "Cereales",
  "12": "Semillas y frutos oleaginosos",
  "15": "Aceites y grasas",
  "16": "Preparados de carne",
  "20": "Preparados de frutas y hortalizas",
  "22": "Bebidas",
  "24": "Tabaco",
  "27": "Combustibles minerales",
  "28": "Químicos inorgánicos",
  "29": "Químicos orgánicos",
  "30": "Farmacéuticos",
  "38": "Químicos varios",
  "39": "Plásticos",
  "40": "Caucho",
  "44": "Madera",
  "47": "Celulosa y papel",
  "48": "Papel y cartón",
  "52": "Algodón",
  "54": "Hilados sintéticos",
  "55": "Fibras sintéticas cortas",
  "57": "Tapices y tapetes",
  "61": "Prendas de punto",
  "62": "Prendas de confección",
  "63": "Preparados textiles",
  "64": "Calzado",
  "69": "Cerámica",
  "70": "Vidrio",
  "71": "Metales preciosos y alhajas",
  "72": "Hierro y acero",
  "73": "Manufacturas de hierro/acero",
  "74": "Cobre",
  "76": "Aluminio",
  "84": "Maquinaria",
  "85": "Electricidad y electrónica",
  "86": "Vías férreas",
  "87": "Vehículos terrestres",
  "90": "Instrumentos ópticos y médicos",
  "94": "Muebles",
  "95": "Manufacturas varias",
};

function num(value: number | string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nombreCapitulo(cmd: string): string {
  return CAPITULOS_NOMBRES[cmd] ?? cmd;
}

function valorDe(r: ComtradeRow): number | null {
  return num(r.primary_usd) ?? num(r.fob_usd);
}

// ---------------------------------------------------------------------------
// Helpers de cálculo compartidos entre modos (mismas tablas, mismo protocolo
// de declarar cada consulta con @nuevo).
// ---------------------------------------------------------------------------

interface ResultadoRca {
  cmdCode: string;
  cmdNombre: string;
  reporterFobUsd: number | null;
  mundoFobUsd: number | null;
  rca: number;
}

interface CargaRca {
  resultados: ResultadoRca[];
  advertencias: string[];
  reporterAll: number | null;
  mundoAll: number | null;
}

/** RCA de un año concreto: país (partner '0') vs Mundo (reporter '0'). */
async function cargarRca(
  db: ToolHandlerContext["db"],
  params: { anio: number; flujo: string; reporter: string }
): Promise<CargaRca> {
  const { anio, flujo, reporter } = params;
  // Lado país: reporter $3 con partner '0' (= total del país por capítulo).
  // Lado Mundo: reporter '0' = agregado mundial ingerido por el conector.
  const { rows } = await db.query<ComtradeRow>(
    // @nuevo: capítulos no-TOTAL del país y del Mundo para la RCA (tabla nueva, sin route Express).
    `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
            es_estimado, es_agregado
     FROM comtrade_flujos
     WHERE anio = $1 AND flujo = $2 AND cmd_code <> 'TOTAL'
       AND partner_code = '0' AND reporter_code IN ($3, '0')`,
    [anio, flujo, reporter]
  );
  const porCmd = new Map<string, { reporterTotal: number | null; mundoTotal: number | null }>();
  for (const r of rows) {
    const entry = porCmd.get(r.cmd_code) ?? { reporterTotal: null, mundoTotal: null };
    const valor = valorDe(r);
    if (r.reporter_code === "0") entry.mundoTotal = valor;
    else entry.reporterTotal = valor;
    porCmd.set(r.cmd_code, entry);
  }
  // Totales "TOTAL" para los denominadores.
  const { rows: totalRows } = await db.query<ComtradeRow>(
    // @nuevo: totales TOTAL del país y del Mundo, denominadores de la RCA (tabla nueva).
    `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
            es_estimado, es_agregado
     FROM comtrade_flujos
     WHERE anio = $1 AND flujo = $2 AND cmd_code = 'TOTAL'
       AND partner_code = '0' AND reporter_code IN ($3, '0')`,
    [anio, flujo, reporter]
  );
  let reporterAll: number | null = null;
  let mundoAll: number | null = null;
  for (const r of totalRows) {
    const valor = valorDe(r);
    if (r.reporter_code === "0") mundoAll = valor;
    else reporterAll = valor;
  }
  const advertencias: string[] = [];
  if (reporterAll === null || reporterAll <= 0) {
    advertencias.push(
      `Sin TOTAL del reporter ${reporter} (partner '0') para ${anio}: correr npm run ingest:comtrade.`
    );
  }
  if (mundoAll === null || mundoAll <= 0) {
    advertencias.push(
      "Sin TOTAL del Mundo (reporter '0'): correr npm run ingest:comtrade — la RCA necesita el agregado mundial que ingesta el conector."
    );
  }
  const hayNumerador = reporterAll !== null && reporterAll > 0;
  const hayDenominador = mundoAll !== null && mundoAll > 0;
  const resultados = [...porCmd.entries()]
    .filter(
      ([, v]) =>
        hayNumerador && hayDenominador &&
        v.reporterTotal !== null && v.mundoTotal !== null &&
        v.reporterTotal > 0 && v.mundoTotal > 0
    )
    .map(([cmd, v]) => ({
      cmdCode: cmd,
      cmdNombre: nombreCapitulo(cmd),
      reporterFobUsd: v.reporterTotal,
      mundoFobUsd: v.mundoTotal,
      rca: (v.reporterTotal! / reporterAll!) / (v.mundoTotal! / mundoAll!),
    }))
    .sort((a, b) => b.rca - a.rca);
  return { resultados, advertencias, reporterAll, mundoAll };
}

interface PuntoSerie {
  reporter: number | null;
  mundo: number | null;
}

interface CargaSerie {
  anios: number[];
  porCmd: Map<string, Map<number, PuntoSerie>>;
  totales: Map<number, PuntoSerie>;
  advertencias: string[];
}

/** Serie anual RCA (país vs Mundo) por capítulo, para un rango desde/hasta opcional. */
async function cargarSerie(
  db: ToolHandlerContext["db"],
  params: { flujo: string; reporter: string; desde: number | null; hasta: number | null }
): Promise<CargaSerie> {
  const { flujo, reporter, desde, hasta } = params;
  const advertencias: string[] = [];
  const { rows } = await db.query<ComtradeRow>(
    // @nuevo: serie por año de capítulos del país y del Mundo para la RCA por capítulo (tabla nueva, sin route Express).
    `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
            es_estimado, es_agregado
     FROM comtrade_flujos
     WHERE flujo = $1 AND partner_code = '0' AND cmd_code <> 'TOTAL'
       AND reporter_code IN ($2, '0')
       AND ($3::int IS NULL OR anio >= $3) AND ($4::int IS NULL OR anio <= $4)`,
    [flujo, reporter, desde, hasta]
  );
  const { rows: totRows } = await db.query<ComtradeRow>(
    // @nuevo: serie por año de los totales TOTAL del país y del Mundo, denominadores de la RCA (tabla nueva).
    `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
            es_estimado, es_agregado
     FROM comtrade_flujos
     WHERE flujo = $1 AND partner_code = '0' AND cmd_code = 'TOTAL'
       AND reporter_code IN ($2, '0')
       AND ($3::int IS NULL OR anio >= $3) AND ($4::int IS NULL OR anio <= $4)`,
    [flujo, reporter, desde, hasta]
  );
  const aniosSet = new Set<number>();
  const porCmd = new Map<string, Map<number, PuntoSerie>>();
  const punto = (m: Map<number, PuntoSerie>, anio: number): PuntoSerie => {
    const e = m.get(anio) ?? { reporter: null, mundo: null };
    m.set(anio, e);
    return e;
  };
  for (const r of rows) {
    aniosSet.add(r.anio);
    const porAnio = porCmd.get(r.cmd_code) ?? new Map<number, PuntoSerie>();
    porCmd.set(r.cmd_code, porAnio);
    const e = punto(porAnio, r.anio);
    const valor = valorDe(r);
    if (r.reporter_code === "0") e.mundo = valor;
    else e.reporter = valor;
  }
  const totales = new Map<number, PuntoSerie>();
  for (const r of totRows) {
    aniosSet.add(r.anio);
    const e = punto(totales, r.anio);
    const valor = valorDe(r);
    if (r.reporter_code === "0") e.mundo = valor;
    else e.reporter = valor;
  }
  const anios = [...aniosSet].sort((a, b) => a - b);
  for (const anio of anios) {
    const t = totales.get(anio);
    if (!t || t.mundo === null || t.mundo <= 0) {
      advertencias.push(
        `Sin TOTAL del Mundo (reporter '0') para ${anio}: la RCA de ese año no se calcula — correr npm run ingest:comtrade.`
      );
    }
    if (!t || t.reporter === null || t.reporter <= 0) {
      advertencias.push(
        `Sin TOTAL del reporter ${reporter} (partner '0') para ${anio}: la RCA de ese año no se calcula — correr npm run ingest:comtrade.`
      );
    }
  }
  if (anios.length === 0) {
    advertencias.push("Sin filas en el rango pedido: correr npm run ingest:comtrade o ampliar desde/hasta.");
  }
  return { anios, porCmd, totales, advertencias };
}

interface ItemSerieRca {
  cmdCode: string;
  cmdNombre: string;
  serie: Array<{ anio: number; rca: number | null }>;
  rcaInicio: number | null;
  rcaFin: number | null;
  delta: number | null;
  tendencia: "alza" | "baja" | "estable" | null;
}

function tendenciaDe(delta: number): "alza" | "baja" | "estable" {
  if (delta >= UMBRAL_TENDENCIA_RCA) return "alza";
  if (delta <= -UMBRAL_TENDENCIA_RCA) return "baja";
  return "estable";
}

/** RCA por año por capítulo a partir de una carga de serie (compartido por rca-serie e informe). */
function calcularSerieRca(carga: CargaSerie): ItemSerieRca[] {
  return [...carga.porCmd.entries()].map(([cmd, porAnio]) => {
    const serie = carga.anios.map((anio) => {
      const t = carga.totales.get(anio);
      const p = porAnio.get(anio);
      const calculable =
        t && p &&
        t.reporter !== null && t.reporter > 0 && t.mundo !== null && t.mundo > 0 &&
        p.reporter !== null && p.reporter > 0 && p.mundo !== null && p.mundo > 0;
      return {
        anio,
        rca: calculable ? ((p!.reporter! / t!.reporter!) / (p!.mundo! / t!.mundo!)) : null,
      };
    });
    const conValor = serie.filter((p) => p.rca !== null);
    const rcaInicio = conValor.length > 0 ? conValor[0].rca! : null;
    const rcaFin = conValor.length > 0 ? conValor[conValor.length - 1].rca! : null;
    const delta = rcaInicio !== null && rcaFin !== null && conValor.length >= 2 ? rcaFin - rcaInicio : null;
    return {
      cmdCode: cmd,
      cmdNombre: nombreCapitulo(cmd),
      serie,
      rcaInicio,
      rcaFin,
      delta,
      tendencia: delta !== null ? tendenciaDe(delta) : null,
    };
  });
}

interface FilaOportunidad {
  cmdCode: string;
  cmdNombre: string;
  anioRca: number;
  rca: number;
  peruXFobUsd: number;
  mundoMFobUsd: number;
  crecimientoMundoM: number;
  participacionPeruMundo: number | null;
}

interface CargaOportunidad {
  anioRca: number | null;
  anioMundoDesde: number | null;
  anioMundoHasta: number | null;
  oportunidades: FilaOportunidad[];
  advertencias: string[];
}

/**
 * Screening: capítulos con RCA (exportaciones) < umbral y demanda mundial al
 * alza (CAGR de las importaciones mundiales del capítulo entre el primer y
 * último año con datos del Mundo).
 */
async function cargarOportunidad(
  db: ToolHandlerContext["db"],
  params: { reporter: string; desde: number | null; hasta: number | null; umbral: number }
): Promise<CargaOportunidad> {
  const { reporter, desde, hasta, umbral } = params;
  const advertencias: string[] = [];
  const { rows } = await db.query<ComtradeRow>(
    // @nuevo: capítulos X y M del país y del Mundo para el screening de oportunidades (tabla nueva, sin route Express).
    `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
            es_estimado, es_agregado
     FROM comtrade_flujos
     WHERE flujo IN ('X', 'M') AND partner_code = '0' AND cmd_code <> 'TOTAL'
       AND reporter_code IN ($1, '0')
       AND ($2::int IS NULL OR anio >= $2) AND ($3::int IS NULL OR anio <= $3)`,
    [reporter, desde, hasta]
  );
  const { rows: totRows } = await db.query<ComtradeRow>(
    // @nuevo: totales TOTAL X y M del país y del Mundo para el screening de oportunidades (tabla nueva, sin route Express).
    `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
            es_estimado, es_agregado
     FROM comtrade_flujos
     WHERE flujo IN ('X', 'M') AND partner_code = '0' AND cmd_code = 'TOTAL'
       AND reporter_code IN ($1, '0')
       AND ($2::int IS NULL OR anio >= $2) AND ($3::int IS NULL OR anio <= $3)`,
    [reporter, desde, hasta]
  );
  const clave = (anio: number, flujo: string, cmd: string) => `${anio}|${flujo}|${cmd}`;
  // valores[(anio, flujo, cmd)] por lado (reporter país / '0' Mundo).
  const valores = new Map<string, PuntoSerie>();
  for (const r of rows) {
    const k = clave(r.anio, r.flujo, r.cmd_code);
    const e = valores.get(k) ?? { reporter: null, mundo: null };
    const valor = valorDe(r);
    if (r.reporter_code === "0") e.mundo = valor;
    else e.reporter = valor;
    valores.set(k, e);
  }
  // totales[(anio, flujo)] por lado.
  const totales = new Map<string, PuntoSerie>();
  for (const r of totRows) {
    const k = `${r.anio}|${r.flujo}`;
    const e = totales.get(k) ?? { reporter: null, mundo: null };
    const valor = valorDe(r);
    if (r.reporter_code === "0") e.mundo = valor;
    else e.reporter = valor;
    totales.set(k, e);
  }
  const aniosReporteX = [...totales.entries()]
    .filter(([k, v]) => k.endsWith("|X") && v.reporter !== null && v.reporter > 0)
    .map(([k]) => Number(k.split("|")[0]))
    .sort((a, b) => a - b);
  const aniosMundoM = [...totales.entries()]
    .filter(([k, v]) => k.endsWith("|M") && v.mundo !== null && v.mundo > 0)
    .map(([k]) => Number(k.split("|")[0]))
    .sort((a, b) => a - b);
  const anioRca = aniosReporteX.length > 0 ? aniosReporteX[aniosReporteX.length - 1] : null;
  const anioMundoDesde = aniosMundoM.length > 0 ? aniosMundoM[0] : null;
  const anioMundoHasta = aniosMundoM.length > 0 ? aniosMundoM[aniosMundoM.length - 1] : null;
  if (anioRca === null) {
    advertencias.push(
      `Sin exportaciones del reporter ${reporter} (partner '0') con TOTAL en el rango: correr npm run ingest:comtrade.`
    );
  }
  if (anioMundoHasta === null) {
    advertencias.push(
      "Sin importaciones mundiales (reporter '0', flujo M): el screening necesita el agregado mundial (bloque --mundo de la ingesta)."
    );
  }
  const oportunidades: FilaOportunidad[] = [];
  let sinDatosXMundo = 0;
  if (anioRca !== null && anioMundoDesde !== null && anioMundoHasta !== null && anioMundoHasta > anioMundoDesde) {
    const cmdsMundoM = new Set<string>();
    for (const [k, v] of valores) {
      const [anioStr, flujoK, cmd] = k.split("|");
      if (flujoK === "M" && cmd !== "TOTAL" && Number(anioStr) === anioMundoHasta && v.mundo !== null && v.mundo > 0) {
        cmdsMundoM.add(cmd);
      }
    }
    for (const cmd of [...cmdsMundoM].sort()) {
      const vM = valores.get(clave(anioMundoHasta, "M", cmd));
      const vXi = valores.get(clave(anioRca, "X", cmd));
      const tXi = totales.get(`${anioRca}|X`);
      if (!vM?.mundo || !vXi?.reporter || !vXi.mundo || !tXi?.reporter || !tXi.mundo) {
        sinDatosXMundo += 1;
        continue;
      }
      const rca = (vXi.reporter / tXi.reporter) / (vXi.mundo / tXi.mundo);
      const vM0 = valores.get(clave(anioMundoDesde, "M", cmd));
      if (!vM0?.mundo || vM0.mundo <= 0) continue;
      const crecimiento = Math.pow(vM.mundo / vM0.mundo, 1 / (anioMundoHasta - anioMundoDesde)) - 1;
      if (rca < umbral && crecimiento > 0) {
        oportunidades.push({
          cmdCode: cmd,
          cmdNombre: nombreCapitulo(cmd),
          anioRca,
          rca,
          peruXFobUsd: vXi.reporter,
          mundoMFobUsd: vM.mundo,
          crecimientoMundoM: crecimiento,
          participacionPeruMundo: anioRca === anioMundoHasta ? vXi.reporter / vM.mundo : null,
        });
      }
    }
    if (sinDatosXMundo > 0) {
      advertencias.push(
        `${sinDatosXMundo} capítulos sin exportaciones completas del país y del Mundo en ${anioRca} se omitieron del screening.`
      );
    }
  }
  oportunidades.sort((a, b) => b.crecimientoMundoM - a.crecimientoMundoM);
  return { anioRca, anioMundoDesde, anioMundoHasta, oportunidades, advertencias };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const limit = Math.min(args.limit ? Number(args.limit) : 200, 500);
  const offset = args.offset ? Number(args.offset) : 0;
  const reporter = (args.reporter as string | undefined) ?? "604";
  const flujo = (args.flujo as string | undefined)?.toUpperCase();
  const modo = (args.modo as string | undefined)?.toLowerCase();

  const conditions: string[] = ["reporter_code = $1"];
  const values: unknown[] = [reporter];
  const push = (cond: string, value: unknown) => {
    values.push(value);
    conditions.push(cond.replace("$$", `$${values.length}`));
  };

  const anio = args.anio ? Number(args.anio) : null;
  const desde = args.desde ? Number(args.desde) : null;
  const hasta = args.hasta ? Number(args.hasta) : null;
  if (anio !== null) push("anio = $$", anio);
  if (desde !== null) push("anio >= $$", desde);
  if (hasta !== null) push("anio <= $$", hasta);
  if (flujo) push("flujo = $$", flujo);
  if (args.partner) push("partner_code = $$", String(args.partner));
  if (args.cmdCode) push("cmd_code = $$", String(args.cmdCode).toUpperCase());
  const where = `WHERE ${conditions.join(" AND ")}`;

  // ---- modo RCA: ventaja comparativa revelada por capítulo ----
  if (modo === "rca") {
    if (anio === null) {
      return {
        status: 400,
        body: { error: "modo=rca requiere `anio` (un año a la vez): la RCA se calcula contra el Mundo del mismo año." },
      };
    }
    const flujoRca = flujo ?? "X";
    const carga = await cargarRca(db, { anio, flujo: flujoRca, reporter });
    return {
      status: 200,
      body: {
        modo: "rca",
        anio,
        flujo: flujoRca,
        reporter,
        mundo: "reporter_code '0' (agregado mundial ingerido por el conector)",
        reporterTotalUsd: carga.reporterAll,
        mundoTotalUsd: carga.mundoAll,
        resultados: carga.resultados,
        advertencias: carga.advertencias,
        interpretacion: "RCA > 1 = ventaja comparativa revelada en ese capítulo; < 1 = desventaja.",
        fuente: FUENTE_COMTRADE,
        ingesta: NOTA_INGESTA,
      },
    };
  }

  // ---- modo RCA-SERIE: la misma RCA por capítulo para todos los años ----
  if (modo === "rca-serie") {
    const flujoSerie = flujo ?? "X";
    const carga = await cargarSerie(db, { flujo: flujoSerie, reporter, desde, hasta });
    const resultados = calcularSerieRca(carga)
      .filter((r) => r.rcaFin !== null)
      .sort((a, b) => (b.rcaFin ?? -Infinity) - (a.rcaFin ?? -Infinity));
    return {
      status: 200,
      body: {
        modo: "rca-serie",
        flujo: flujoSerie,
        reporter,
        anioInicio: carga.anios[0] ?? null,
        anioFin: carga.anios[carga.anios.length - 1] ?? null,
        anios: carga.anios,
        umbralTendencia: UMBRAL_TENDENCIA_RCA,
        resultados,
        advertencias: carga.advertencias,
        interpretacion:
          `Serie RCA por capítulo: > 1 = ventaja en ese año. tendencia = alza/baja si el delta fin-inicio ` +
          `supera ${UMBRAL_TENDENCIA_RCA}; estable (o null con < 2 años de datos) en caso contrario.`,
        fuente: FUENTE_COMTRADE,
        ingesta: NOTA_INGESTA,
      },
    };
  }

  // ---- modo OPORTUNIDAD: RCA < umbral con demanda mundial creciente ----
  if (modo === "oportunidad") {
    const umbralRca = args.umbralRca !== undefined ? Number(args.umbralRca) : 1;
    if (!Number.isFinite(umbralRca) || umbralRca <= 0) {
      return {
        status: 400,
        body: { error: "`umbralRca` debe ser un número positivo (default 1)." },
      };
    }
    const carga = await cargarOportunidad(db, { reporter, desde, hasta, umbral: umbralRca });
    return {
      status: 200,
      body: {
        modo: "oportunidad",
        reporter,
        anioRca: carga.anioRca,
        anioMundoDesde: carga.anioMundoDesde,
        anioMundoHasta: carga.anioMundoHasta,
        umbralRca,
        criterio:
          `RCA(exportaciones, ${carga.anioRca ?? "?"}) < ${umbralRca} y CAGR de importaciones mundiales ` +
          `> 0 entre ${carga.anioMundoDesde ?? "?"} y ${carga.anioMundoHasta ?? "?"}.`,
        resultados: carga.oportunidades,
        advertencias: carga.advertencias,
        interpretacion:
          "Cada fila es un capítulo donde el mercado mundial crece y Perú aún no tiene ventaja: crecimientoMundoM es el CAGR de las importaciones mundiales y participacionPeruMundo la cuota de las exportaciones peruanas en esa demanda.",
        fuente: FUENTE_COMTRADE,
        ingesta: NOTA_INGESTA,
      },
    };
  }

  // ---- modo RCA-BILATERAL: el país dentro del mercado de un socio ----
  if (modo === "rca-bilateral") {
    const socio = args.socio !== undefined ? String(args.socio).trim() : "";
    if (anio === null) {
      return {
        status: 400,
        body: { error: "modo=rca-bilateral requiere `anio` (un año a la vez)." },
      };
    }
    if (!socio) {
      return {
        status: 400,
        body: { error: "modo=rca-bilateral requiere `socio` (código numérico Comtrade del mercado destino, ej. '156' = China)." },
      };
    }
    if (socio === reporter) {
      return { status: 400, body: { error: "`socio` debe ser distinto del reporter." } };
    }
    if (socio === "0") {
      return {
        status: 400,
        body: { error: "`socio` '0' (Mundo) no tiene sentido bilateral: el agregado mundial ya está en modo=rca." },
      };
    }
    // Exportaciones del país y del Mundo por capítulo (numerador país + RCA clásica).
    const { rows: xRows } = await db.query<ComtradeRow>(
      // @nuevo: capítulos X del país y del Mundo para la RCA bilateral (tabla nueva, sin route Express).
      `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
              es_estimado, es_agregado
       FROM comtrade_flujos
       WHERE anio = $1 AND flujo = 'X' AND partner_code = '0' AND cmd_code <> 'TOTAL'
         AND reporter_code IN ($2, '0')`,
      [anio, reporter]
    );
    const { rows: xTotRows } = await db.query<ComtradeRow>(
      // @nuevo: totales X del país y del Mundo para la RCA bilateral (tabla nueva, sin route Express).
      `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
              es_estimado, es_agregado
       FROM comtrade_flujos
       WHERE anio = $1 AND flujo = 'X' AND partner_code = '0' AND cmd_code = 'TOTAL'
         AND reporter_code IN ($2, '0')`,
      [anio, reporter]
    );
    // Importaciones del socio y del Mundo por capítulo (demanda del mercado destino).
    const { rows: mRows } = await db.query<ComtradeRow>(
      // @nuevo: capítulos M del socio y del Mundo — demanda del mercado destino de la RCA bilateral (tabla nueva, sin route Express).
      `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
              es_estimado, es_agregado
       FROM comtrade_flujos
       WHERE anio = $1 AND flujo = 'M' AND partner_code = '0' AND cmd_code <> 'TOTAL'
         AND reporter_code IN ($2, '0')`,
      [anio, socio]
    );
    const { rows: mTotRows } = await db.query<ComtradeRow>(
      // @nuevo: totales M del socio y del Mundo para la RCA bilateral (tabla nueva, sin route Express).
      `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
              es_estimado, es_agregado
       FROM comtrade_flujos
       WHERE anio = $1 AND flujo = 'M' AND partner_code = '0' AND cmd_code = 'TOTAL'
         AND reporter_code IN ($2, '0')`,
      [anio, socio]
    );
    // Exportaciones del país hacia el socio (partner = socio): numerador bilateral.
    const { rows: bilateralRows } = await db.query<ComtradeRow>(
      // @nuevo: exportaciones país→socio por capítulo, numerador de la RCA bilateral (tabla nueva, sin route Express).
      `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
              es_estimado, es_agregado
       FROM comtrade_flujos
       WHERE anio = $1 AND flujo = 'X' AND reporter_code = $2 AND partner_code = $3`,
      [anio, reporter, socio]
    );
    const x = new Map<string, number | null>();
    for (const r of xRows) x.set(`${r.reporter_code}|${r.cmd_code}`, valorDe(r));
    let xPaisAll: number | null = null;
    let xMundoAll: number | null = null;
    for (const r of xTotRows) {
      const v = valorDe(r);
      if (r.reporter_code === "0") xMundoAll = v;
      else xPaisAll = v;
    }
    const mSocio = new Map<string, number | null>();
    const mMundo = new Map<string, number | null>();
    for (const r of mRows) {
      const v = valorDe(r);
      (r.reporter_code === "0" ? mMundo : mSocio).set(r.cmd_code, v);
    }
    let mSocioAll: number | null = null;
    let mMundoAll: number | null = null;
    for (const r of mTotRows) {
      const v = valorDe(r);
      if (r.reporter_code === "0") mMundoAll = v;
      else mSocioAll = v;
    }
    const haciaSocio = new Map<string, number | null>();
    let haciaSocioAll: number | null = null;
    for (const r of bilateralRows) {
      const v = valorDe(r);
      if (r.cmd_code === "TOTAL") haciaSocioAll = v;
      else haciaSocio.set(r.cmd_code, v);
    }
    const advertencias: string[] = [];
    if (haciaSocioAll === null || haciaSocio.size === 0) {
      advertencias.push(
        `Sin exportaciones del reporter ${reporter} hacia el socio ${socio} para ${anio}: correr npm run ingest:comtrade (el partner debe estar en --partners).`
      );
    }
    if (mSocioAll === null || mSocio.size === 0) {
      advertencias.push(
        `Sin importaciones del socio ${socio} (partner '0') para ${anio}: correr npm run ingest:comtrade — el bloque de socios ingiere al socio como reporter (sus flujos con el mundo).`
      );
    }
    if (mMundoAll === null || mMundoAll <= 0) {
      advertencias.push(
        "Sin importaciones mundiales (reporter '0', flujo M): correr npm run ingest:comtrade (bloque --mundo)."
      );
    }
    if (xPaisAll === null || xPaisAll <= 0) {
      advertencias.push(`Sin exportaciones totales del reporter ${reporter} para ${anio}: correr npm run ingest:comtrade.`);
    }
    const cmds = new Set([...haciaSocio.keys(), ...mSocio.keys(), ...mMundo.keys()]);
    let sinDatos = 0;
    const mapear = (cmd: string) => {
      const xij = haciaSocio.get(cmd) ?? null;
      const mje = mSocio.get(cmd) ?? null;
      const mwe = mMundo.get(cmd) ?? null;
      const xpe = x.get(`${reporter}|${cmd}`) ?? null;
      const xwe = x.get(`0|${cmd}`) ?? null;
      const rcaBilateral =
        xij !== null && xij > 0 && mje !== null && mje > 0 && xpe !== null && xpe > 0 && mwe !== null && mwe > 0
          ? (xij / mje) / (xpe / mwe)
          : null;
      if (rcaBilateral === null) sinDatos += 1;
      const especializacionBilateral =
        xij !== null && xij > 0 && haciaSocioAll !== null && haciaSocioAll > 0 &&
        xwe !== null && xwe > 0 && xMundoAll !== null && xMundoAll > 0
          ? (xij / haciaSocioAll) / (xwe / xMundoAll)
          : null;
      const rca =
        xpe !== null && xpe > 0 && xPaisAll !== null && xPaisAll > 0 &&
        xwe !== null && xwe > 0 && xMundoAll !== null && xMundoAll > 0
          ? (xpe / xPaisAll) / (xwe / xMundoAll)
          : null;
      const participacionMercado = xij !== null && xij > 0 && mje !== null && mje > 0 ? xij / mje : null;
      return {
        cmdCode: cmd,
        cmdNombre: nombreCapitulo(cmd),
        fobUsd: xij,
        rcaBilateral,
        especializacionBilateral,
        rca,
        participacionMercado,
      };
    };
    const resultados = [...cmds].sort().map(mapear).filter((r) => r.rcaBilateral !== null);
    if (sinDatos > 0) {
      advertencias.push(
        `${sinDatos} capítulos sin datos completos (país, socio y Mundo) se omitieron del cálculo.`
      );
    }
    return {
      status: 200,
      body: {
        modo: "rca-bilateral",
        anio,
        reporter,
        socio,
        formulas: {
          rcaBilateral:
            "(X(país→socio, e) / M(socio, e)) / (X(país, e) / M(mundo, e)) — cuota de país en el mercado del socio relativa a su peso en la demanda mundial del capítulo",
          especializacionBilateral:
            "(X(país→socio, e) / X(país→socio)) / (X(mundo, e) / X(mundo)) — especialización del flujo hacia el socio vs peso mundial del capítulo",
          rca: "Balassa clásica del país en el año (idéntica a modo=rca)",
          participacionMercado: "X(país→socio, e) / M(socio, e) — cuota de país en las importaciones del socio",
        },
        resultados: resultados.sort((a, b) => (b.rcaBilateral ?? -Infinity) - (a.rcaBilateral ?? -Infinity)),
        advertencias,
        interpretacion:
          "rcaBilateral > 1 = el país está sobre-representido en ese capítulo del mercado del socio respecto a su fuerza exportadora global.",
        fuente: FUENTE_COMTRADE,
        ingesta: NOTA_INGESTA,
      },
    };
  }

  // ---- modo INFORME: resumen ejecutivo en Markdown ----
  if (modo === "informe") {
    if (anio === null) {
      return {
        status: 400,
        body: { error: "modo=informe requiere `anio` (el año del resumen)." },
      };
    }
    const flujoInforme = flujo ?? "X";
    const rcaCarga = await cargarRca(db, { anio, flujo: flujoInforme, reporter });
    const serieCarga = await cargarSerie(db, { flujo: flujoInforme, reporter, desde, hasta });
    const oppCarga = await cargarOportunidad(db, { reporter, desde, hasta, umbral: 1 });
    const fmtUsd = (v: number | null | undefined): string => {
      if (v === null || v === undefined) return "s/d";
      if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
      if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
      return `$${(v / 1e6).toFixed(0)}M`;
    };
    const pct = (v: number): string => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
    const topRca = rcaCarga.resultados.slice(0, 10);
    const desventajas = rcaCarga.resultados.slice(-5).reverse();
    const tendencias = calcularSerieRca(serieCarga)
      .filter((r) => r.delta !== null && r.tendencia !== null && r.tendencia !== "estable")
      .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
      .slice(0, 6);
    const oportunidades = oppCarga.oportunidades.slice(0, 8);
    const lineas: string[] = [
      `# Informe Comtrade — reporter ${reporter}, ${anio}, flujo ${flujoInforme}`,
      "",
      `- Total del país: ${fmtUsd(rcaCarga.reporterAll)} | Total del Mundo: ${fmtUsd(rcaCarga.mundoAll)} | capítulos con RCA calculable: ${rcaCarga.resultados.length}`,
      "",
      "## Ventaja comparativa revelada (RCA > 1, top 10)",
      "| Cap | Capítulo | RCA | Exportaciones país | Mundo |",
      "|---|---|---|---|---|",
      ...topRca.map((r) => `| ${r.cmdCode} | ${r.cmdNombre} | ${r.rca.toFixed(2)} | ${fmtUsd(r.reporterFobUsd)} | ${fmtUsd(r.mundoFobUsd)} |`),
      "",
      "## Mayores desventajas",
      "| Cap | Capítulo | RCA |",
      "|---|---|---|",
      ...desventajas.map((r) => `| ${r.cmdCode} | ${r.cmdNombre} | ${r.rca.toFixed(2)} |`),
    ];
    if (tendencias.length > 0) {
      lineas.push(
        "",
        `## Tendencias de la ventaja (delta mayor a ${UMBRAL_TENDENCIA_RCA}, ${serieCarga.anios[0] ?? "?"} → ${serieCarga.anios[serieCarga.anios.length - 1] ?? "?"})`,
        "| Cap | Capítulo | Tendencia | RCA inicio | RCA fin | Δ |",
        "|---|---|---|---|---|---|",
        ...tendencias.map(
          (r) =>
            `| ${r.cmdCode} | ${r.cmdNombre} | ${r.tendencia} | ${r.rcaInicio?.toFixed(2) ?? "s/d"} | ${r.rcaFin?.toFixed(2) ?? "s/d"} | ${(r.delta! >= 0 ? "+" : "")}${r.delta!.toFixed(2)} |`
        )
      );
    }
    if (oportunidades.length > 0) {
      lineas.push(
        "",
        `## Oportunidades (RCA < 1 y demanda mundial al alza${oppCarga.anioRca !== null ? `, RCA ${oppCarga.anioRca}` : ""})`,
        "| Cap | Capítulo | CAGR demanda mundial | RCA | Participación Perú |",
        "|---|---|---|---|---|",
        ...oportunidades.map(
          (r) =>
            `| ${r.cmdCode} | ${r.cmdNombre} | ${pct(r.crecimientoMundoM)} | ${r.rca.toFixed(2)} | ${r.participacionPeruMundo !== null ? (r.participacionPeruMundo * 100).toFixed(2) + "%" : "s/d"} |`
        )
      );
    }
    const advertencias = [...new Set([...rcaCarga.advertencias, ...serieCarga.advertencias, ...oppCarga.advertencias])];
    if (advertencias.length > 0) {
      lineas.push("", "## Advertencias", ...advertencias.map((a) => `- ${a}`));
    }
    lineas.push("", `Fuente: ${FUENTE_COMTRADE}. ${NOTA_INGESTA}.`);
    return {
      status: 200,
      body: {
        modo: "informe",
        anio,
        flujo: flujoInforme,
        reporter,
        markdown: lineas.join("\n"),
        advertencias,
        fuente: FUENTE_COMTRADE,
        ingesta: NOTA_INGESTA,
      },
    };
  }

  const groupBy = (args.groupBy as string | undefined)?.toLowerCase();
  if (groupBy) {
    const col = GROUP_BY_COLUMNAS[groupBy];
    if (!col) {
      return {
        status: 400,
        body: { error: `groupBy inválido: "${groupBy}". Valores: ${Object.keys(GROUP_BY_COLUMNAS).join(", ")}.` },
      };
    }
    const { rows } = await db.query<{ dimension: string; fob_usd: string; filas: string }>(
      // @nuevo: agregación por dimensión sobre la tabla nueva de Comtrade (sin route Express).
      `SELECT ${col} AS dimension, SUM(COALESCE(fob_usd, primary_usd)) AS fob_usd, COUNT(*) AS filas
       FROM comtrade_flujos
       ${where}
       GROUP BY ${col}
       ORDER BY fob_usd DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    return {
      status: 200,
      body: {
        resultados: rows.map((r) => ({ dimension: groupBy, valor: r.dimension, fobUsd: Number(r.fob_usd), filas: Number(r.filas) })),
        unidad: "USD (unidades, no millones)",
        fuente: FUENTE_COMTRADE,
        ingesta: NOTA_INGESTA,
      },
    };
  }

  const { rows } = await db.query<ComtradeRow>(
    // @nuevo: lectura filtrada de la tabla nueva de Comtrade (sin route Express).
    `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
            es_estimado, es_agregado
     FROM comtrade_flujos
     ${where}
     ORDER BY anio DESC, partner_code, cmd_code
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        anio: r.anio,
        flujo: r.flujo,
        reporterCode: r.reporter_code,
        partnerCode: r.partner_code,
        cmdCode: r.cmd_code,
        fobUsd: num(r.fob_usd),
        cifUsd: num(r.cif_usd),
        primaryUsd: num(r.primary_usd),
        esEstimado: r.es_estimado,
        esAgregado: r.es_agregado,
      })),
      total: rows.length,
      unidad: "USD (unidades, no millones)",
      notas: "partnerCode '0' = Mundo. Valores es_estimado/es_agregado vienen de la fuente.",
      fuente: FUENTE_COMTRADE,
      ingesta: NOTA_INGESTA,
    },
  };
}

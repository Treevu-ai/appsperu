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
 * Dos modos:
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

function num(value: number | string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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
    // Lado país: reporter $3 con partner '0' (= total del país por capítulo).
    // Lado Mundo: reporter '0' = agregado mundial ingerido por el conector.
    const { rows } = await db.query<ComtradeRow>(
      // @nuevo: capítulos no-TOTAL del país y del Mundo para la RCA (tabla nueva, sin route Express).
      `SELECT anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, primary_usd,
              es_estimado, es_agregado
       FROM comtrade_flujos
       WHERE anio = $1 AND flujo = $2 AND cmd_code <> 'TOTAL'
         AND partner_code = '0' AND reporter_code IN ($3, '0')`,
      [anio, flujoRca, reporter]
    );
    const porCmd = new Map<string, { reporterTotal: number | null; mundoTotal: number | null }>();
    for (const r of rows) {
      const entry = porCmd.get(r.cmd_code) ?? { reporterTotal: null, mundoTotal: null };
      const valor = num(r.primary_usd) ?? num(r.fob_usd);
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
      [anio, flujoRca, reporter]
    );
    let reporterAll: number | null = null;
    let mundoAll: number | null = null;
    for (const r of totalRows) {
      const valor = num(r.primary_usd) ?? num(r.fob_usd);
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
        reporterFobUsd: v.reporterTotal,
        mundoFobUsd: v.mundoTotal,
        rca: (v.reporterTotal! / reporterAll!) / (v.mundoTotal! / mundoAll!),
      }))
      .sort((a, b) => b.rca - a.rca);
    return {
      status: 200,
      body: {
        modo: "rca",
        anio,
        flujo: flujoRca,
        reporter,
        mundo: "reporter_code '0' (agregado mundial ingerido por el conector)",
        reporterTotalUsd: reporterAll,
        mundoTotalUsd: mundoAll,
        resultados,
        advertencias,
        interpretacion: "RCA > 1 = ventaja comparativa revelada en ese capítulo; < 1 = desventaja.",
        fuente: "UN Comtrade (comtradeapi.un.org, endpoint autenticado con COMTRADE_API_KEY; preview público sin key)",
        ingesta: "manual, sin scheduler — refleja la última corrida del conector",
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
        fuente: "UN Comtrade (comtradeapi.un.org, endpoint autenticado con COMTRADE_API_KEY; preview público sin key)",
        ingesta: "manual, sin scheduler — refleja la última corrida del conector",
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
      fuente: "UN Comtrade (comtradeapi.un.org, endpoint preview público)",
      ingesta: "manual, sin scheduler — refleja la última corrida del conector",
    },
  };
}

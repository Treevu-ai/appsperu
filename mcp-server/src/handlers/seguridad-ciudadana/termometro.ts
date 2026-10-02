import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface HistorialRow extends NeonRow {
  anio: number;
  mes: number;
  cantidad: number | string;
  tasa_100k: number | string | null;
}

interface ActualRow extends NeonRow {
  anio: number;
  mes: number;
  cantidad: number | string;
  media: number | string | null;
  desviacion: number | string | null;
  n: number | string;
  z_score: number | string | null;
  poblacion: number | string | null;
  tasa_100k: number | string | null;
  nivel: string;
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

/**
 * Handler para `seguridad_ciudadana_denuncias_termometro` — GET
 * /api/denuncias/termometro. SQL idéntico a
 * apps/seguridad-ciudadana/api/src/routes/termometro.ts.
 */
export async function get(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamentoArg = args.departamento as string | undefined;
  if (!departamentoArg) {
    return { status: 400, body: { error: "departamento es requerido" } };
  }
  const dep = departamentoArg.toUpperCase();
  const modalidad = args.modalidad as string | undefined;
  const anio = args.anio as string | undefined;

  const modalidadFiltro = modalidad ? `AND modalidad = $2` : "";
  const baseParams: unknown[] = modalidad ? [dep, modalidad] : [dep];
  const anioPlaceholder = `$${baseParams.length + 1}`;
  const anioFiltro = anio ? `AND anio <= ${anioPlaceholder}` : "";
  const historialParams = anio ? [...baseParams, Number(anio)] : baseParams;

  const { rows: historial } = await db.query<HistorialRow>(
    `WITH universo AS (
       SELECT anio, mes, SUM(cantidad)::numeric AS cantidad
       FROM police_reports
       WHERE departamento = $1 ${modalidadFiltro} ${anioFiltro}
       GROUP BY anio, mes
     ),
     objetivo AS (
       SELECT mes, anio FROM universo ORDER BY anio DESC, mes DESC LIMIT 1
     )
     SELECT u.anio, u.mes, u.cantidad,
            CASE WHEN p.poblacion IS NULL OR p.poblacion = 0 THEN NULL
                 ELSE (u.cantidad / p.poblacion) * 100000 END AS tasa_100k
     FROM universo u
     JOIN objetivo o ON o.mes = u.mes AND u.anio < o.anio
     LEFT JOIN poblacion_departamental p ON p.departamento = $1
     ORDER BY u.anio`,
    historialParams
  );

  const { rows: actualRows } = await db.query<ActualRow>(
    `WITH universo AS (
       SELECT anio, mes, SUM(cantidad)::numeric AS cantidad
       FROM police_reports
       WHERE departamento = $1 ${modalidadFiltro} ${anioFiltro}
       GROUP BY anio, mes
     ),
     objetivo AS (
       SELECT anio, mes, cantidad FROM universo ORDER BY anio DESC, mes DESC LIMIT 1
     ),
     historial_mismo_mes AS (
       SELECT u.cantidad
       FROM universo u
       JOIN objetivo o ON o.mes = u.mes AND u.anio < o.anio
     ),
     stats AS (
       SELECT avg(cantidad) AS media, stddev_samp(cantidad) AS desviacion, count(*) AS n
       FROM historial_mismo_mes
     ),
     calculado AS (
       SELECT o.anio, o.mes, o.cantidad, s.media, s.desviacion, s.n,
              CASE WHEN s.desviacion IS NULL OR s.desviacion = 0 THEN NULL
                   ELSE (o.cantidad - s.media) / s.desviacion END AS z_score
       FROM objetivo o CROSS JOIN stats s
     )
     SELECT c.anio, c.mes, c.cantidad, c.media, c.desviacion, c.n, c.z_score,
            p.poblacion,
            CASE WHEN p.poblacion IS NULL OR p.poblacion = 0 THEN NULL
                 ELSE (c.cantidad / p.poblacion) * 100000 END AS tasa_100k,
            CASE
              WHEN c.z_score IS NULL THEN 'SIN_HISTORIAL'
              WHEN c.z_score > 3 THEN 'CRÍTICO'
              WHEN c.z_score > 2 THEN 'ALERTA'
              WHEN c.z_score > 1 THEN 'NORMAL'
              ELSE 'BAJO'
            END AS nivel
     FROM calculado c
     LEFT JOIN poblacion_departamental p ON p.departamento = $1`,
    historialParams
  );

  const actual = actualRows[0] ?? null;
  if (!actual) {
    return {
      status: 404,
      body: { error: `Sin datos de SIDPOL para departamento="${dep}"${modalidad ? ` y modalidad="${modalidad}"` : ""}.` },
    };
  }

  const ultimoAnioPrevio = historial.length > 0 ? historial[historial.length - 1] : null;
  const actualCantidad = Number(actual.cantidad);
  const variacionInteranual = ultimoAnioPrevio && Number(ultimoAnioPrevio.cantidad) > 0
    ? ((actualCantidad - Number(ultimoAnioPrevio.cantidad)) / Number(ultimoAnioPrevio.cantidad)) * 100
    : null;
  const variacionVsPromedioHistorico = actual.media && Number(actual.media) > 0
    ? ((actualCantidad - Number(actual.media)) / Number(actual.media)) * 100
    : null;
  const zScore = actual.z_score === null ? null : Number(actual.z_score);

  return {
    status: 200,
    body: {
      departamento: dep,
      modalidad: modalidad ?? null,
      generadoEn: new Date().toISOString(),
      series: {
        historico: historial.map((h) => ({
          anio: h.anio,
          mes: h.mes,
          cantidad: Number(h.cantidad),
          tasa_100k: h.tasa_100k === null ? null : Number(h.tasa_100k),
        })),
        actual: {
          anio: actual.anio,
          mes: actual.mes,
          cantidad: actualCantidad,
          tasa_100k: actual.tasa_100k === null ? null : Number(actual.tasa_100k),
          z_score: zScore,
          nivel: actual.nivel,
          percentil: zScore === null ? null : Math.round(normalCdf(zScore) * 100),
        },
      },
      comparativo: {
        variacion_interanual_pct: variacionInteranual === null ? null : Math.round(variacionInteranual * 10) / 10,
        variacion_mensual_pct: variacionVsPromedioHistorico === null ? null : Math.round(variacionVsPromedioHistorico * 10) / 10,
      },
      benchmark: historial.map((h) => ({
        anio: h.anio,
        cantidad: Number(h.cantidad),
        tasa_100k: h.tasa_100k === null ? null : Number(h.tasa_100k),
      })),
      fuente: {
        dataset: "PNP/SIDPOL - Denuncias Policiales, población denominador: RENIEC Padrón Electoral 2026 (proxy 18+)",
        nota: "tasa_100k usa un denominador de población adulta (18+) registrada en RENIEC, no el censo INEI de población total.",
      },
    },
  };
}

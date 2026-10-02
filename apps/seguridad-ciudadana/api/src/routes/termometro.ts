import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const termometroRouter = Router();

interface HistorialRow {
  anio: number;
  mes: number;
  cantidad: number;
  tasa_100k: number | null;
}

interface ActualRow {
  anio: number;
  mes: number;
  cantidad: number;
  media: number | null;
  desviacion: number | null;
  n: number;
  z_score: number | null;
  poblacion: number | null;
  tasa_100k: number | null;
  nivel: string;
}

const TermometroQuerySchema = z.object({
  departamento: z.string().min(1, "departamento es requerido"),
  modalidad: z.string().min(1).optional(),
  anio: z
    .string()
    .regex(/^\d{4}$/, "anio debe ser un año de 4 dígitos")
    .optional(),
});

/** Aproximación de la CDF normal estándar (Zelen & Severo) para traducir un
 * z-score a un percentil legible — el tamaño real de la muestra histórica
 * (8 años) es demasiado chico para un percentil empírico confiable. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

/**
 * Termómetro de denuncias (SIDPOL) — Historia 2.2, SID-05 a SID-08.
 * **SID-09 NO está implementado** (ver nota más abajo) -- este endpoint
 * cubre SID-05/06/07/08 del backlog, no los 5 tickets completos.
 *
 * `nivel`/`z_score`/`tasa_100k` se calculan en SQL (window/aggregate
 * functions sobre la serie histórica del mismo mes en años previos, JOIN
 * contra `poblacion_departamental`), no en este handler — así una fila ya
 * trae todo listo y el handler solo da forma a la respuesta.
 *
 * Corte: z > 3 → CRÍTICO | z > 2 → ALERTA | z > 1 → NORMAL | si no → BAJO.
 * Sin desviación histórica (0 o 1 solo año de datos) → "SIN_HISTORIAL", no
 * se fuerza un nivel con una sola muestra.
 *
 * SID-09 (excluir diciembre/julio por estacionalidad) NO está implementado:
 * es una decisión de producto (¿se excluyen del cálculo de línea base, o
 * del mes evaluado?) que no estaba definida al escribir este handler --
 * pendiente, ver nota en docs/backlog/backlog-rastro-proyectos.md. Pedir
 * `departamento=X` para julio o diciembre hoy evalúa esos meses con el
 * mismo criterio que cualquier otro, sin ningún ajuste estacional.
 *
 * `variacion_mensual_pct` compara contra el promedio histórico del mismo
 * mes (no contra el mes calendario anterior): con el contrato de 2 queries
 * de este endpoint no hay forma de traer el mes previo sin una tercera
 * consulta. `variacion_interanual_pct` sí es real: mismo mes, año anterior.
 */
termometroRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(TermometroQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, modalidad, anio } = parsed;

    const dep = departamento.toUpperCase();
    const modalidadFiltro = modalidad ? `AND modalidad = $2` : "";
    const baseParams: unknown[] = modalidad ? [dep, modalidad] : [dep];
    const anioPlaceholder = `$${baseParams.length + 1}`;
    // El filtro de año se aplica a `objetivo` (qué año se evalúa como
    // "actual"), NUNCA a `universo` (el histórico completo): filtrar el
    // universo a `anio <= X` hacía que un año sin filas cayera en silencio
    // al año anterior más cercano en vez de responder 404 -- hallazgo de
    // CodeRabbit en PR #224, confirmado. Con el filtro solo en `objetivo`,
    // un año sin datos deja esa CTE vacía y el query entero no devuelve
    // filas (404 más abajo), mientras que `historial` (años antes del
    // objetivo) sigue viendo el universo completo sin restringir.
    const objetivoFiltro = anio ? `WHERE anio = ${anioPlaceholder}` : "";
    const historialParams = anio ? [...baseParams, Number(anio)] : baseParams;

    const { rows: historial } = await pool.query<HistorialRow>(
      `WITH universo AS (
         SELECT anio, mes, SUM(cantidad)::numeric AS cantidad
         FROM police_reports
         WHERE departamento = $1 ${modalidadFiltro}
         GROUP BY anio, mes
       ),
       objetivo AS (
         SELECT mes, anio FROM universo ${objetivoFiltro} ORDER BY anio DESC, mes DESC LIMIT 1
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

    const { rows: actualRows } = await pool.query<ActualRow>(
      `WITH universo AS (
         SELECT anio, mes, SUM(cantidad)::numeric AS cantidad
         FROM police_reports
         WHERE departamento = $1 ${modalidadFiltro}
         GROUP BY anio, mes
       ),
       objetivo AS (
         SELECT anio, mes, cantidad FROM universo ${objetivoFiltro} ORDER BY anio DESC, mes DESC LIMIT 1
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
      res.status(404).json({ error: `Sin datos de SIDPOL para departamento="${dep}"${modalidad ? ` y modalidad="${modalidad}"` : ""}.` });
      return;
    }

    const ultimoAnioPrevio = historial.length > 0 ? historial[historial.length - 1] : null;
    const variacionInteranual = ultimoAnioPrevio && ultimoAnioPrevio.cantidad > 0
      ? ((Number(actual.cantidad) - Number(ultimoAnioPrevio.cantidad)) / Number(ultimoAnioPrevio.cantidad)) * 100
      : null;
    const variacionVsPromedioHistorico = actual.media && Number(actual.media) > 0
      ? ((Number(actual.cantidad) - Number(actual.media)) / Number(actual.media)) * 100
      : null;

    res.json({
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
          cantidad: Number(actual.cantidad),
          tasa_100k: actual.tasa_100k === null ? null : Number(actual.tasa_100k),
          z_score: actual.z_score === null ? null : Number(actual.z_score),
          nivel: actual.nivel,
          percentil: actual.z_score === null ? null : Math.round(normalCdf(Number(actual.z_score)) * 100),
        },
      },
      comparativo: {
        variacion_interanual_pct: variacionInteranual === null ? null : Math.round(variacionInteranual * 10) / 10,
        variacion_mensual_pct: variacionVsPromedioHistorico === null ? null : Math.round(variacionVsPromedioHistorico * 10) / 10,
      },
      // Benchmark real (comparación contra otros departamentos del mismo mes)
      // requeriría una tercera consulta fuera del contrato de este endpoint
      // v1 -- se expone el histórico propio como aproximación mínima.
      benchmark: historial.map((h) => ({
        anio: h.anio,
        cantidad: Number(h.cantidad),
        tasa_100k: h.tasa_100k === null ? null : Number(h.tasa_100k),
      })),
      fuente: {
        dataset: "PNP/SIDPOL - Denuncias Policiales, población denominador: RENIEC Padrón Electoral 2026 (proxy 18+)",
        nota: "tasa_100k usa un denominador de población adulta (18+) registrada en RENIEC, no el censo INEI de población total.",
      },
    });
  })
);

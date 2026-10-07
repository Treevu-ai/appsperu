import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const indiceDenunciasRouter = Router();

/**
 * Índice de inseguridad por modalidad de denuncia policial (SIDPOL).
 *
 * Calcula la tasa de denuncias por cada 10,000 habitantes por departamento × modalidad
 * para un año dado, permitiendo comparar la intensidad delictiva entre departamentos
 * de manera normalizada por población.
 *
 * Metodología:
 *   - Tasa = (total_denuncias × 10,000) / población_departamento
 *   - El numerador es la suma de denuncias SIDPOL por modalidad × año (no importa
 *     el distrito — se agregan a nivel departamental).
 *   - El denominador es la población del departamento según RENIEC (padrón electoral 2026,
 *     mayores de 18 años como proxy). Tabla `poblacion_departamental`.
 *   - Si no hay población para el departamento, la tasa se devuelve como null.
 *   - Ranking: posición de la tasa dentro del grupo de modalidades del departamento
 *     (percentil), o comparativo entre departamentos para una modalidad fija.
 *
 * Limitaciones documentadas:
 *   - La población del padrón electoral (18+) es una proxy — excluye menores.
 *     Distritos o provincias intra-departamentales con perfiles etarios distintos
 *     de la media departamental no se capturan.
 *   - SIDPOL mide solo denuncias hechas en comisaría — excluye hechos no denunciados
 *     (dark figure). Un departamento con alta tasa puede reflejar buena cultura de
 *     denuncia, no necesariamente más criminalidad.
 *   - La modalidad es la clasificación de la denuncia, no el tipo de victimario.
 *     Homologación entre años puede variar.
 *   - La población disponible es la del padrón electoral actualizado (vintage 2026),
 *     más reciente que el censo pero proxy sobre mayores de edad.
 *   - No existe tabla de población a nivel provincial: cuando se filtra por
 *     `provincia`, solo se devuelve el conteo de denuncias — la tasa por
 *     10,000 habitantes requiere población departamental y NO se puede
 *     calcular correctamente a nivel provincia (dividir el numerador
 *     provincial por la población de TODO el departamento infla la tasa
 *     real — bug confirmado por CodeRabbit).
 */

const IndiceDenunciasQuerySchema = z.object({
  /** Año fiscal. Default: el más reciente en la tabla. */
  anio: z.coerce.number().int().min(2018).max(2100).optional(),
  /** Filtrar a un departamento. Default: LA LIBERTAD. */
  departamento: z.string().min(1).default("LA LIBERTAD"),
  /** Filtrar a una provincia (agrega dentro del departamento). */
  provincia: z.string().min(1).optional(),
  /** Filtrar a una modalidad. */
  modalidad: z.string().min(1).optional(),
  /** Orden de salida. */
  orden: z.enum(["tasa_desc", "tasa_asc", "denuncias_desc", "modalidad_asc"]).optional().default("tasa_desc"),
});

indiceDenunciasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(IndiceDenunciasQuerySchema, req.query, res);
    if (!parsed) return;

    const { anio, departamento, provincia, modalidad, orden } = parsed;
    const depto = departamento.toUpperCase();

    // Determinar el año más reciente si no se especifica
    let anioFinal = anio;
    if (anioFinal === undefined) {
      const { rows: yearRows } = await pool.query(
        `SELECT MAX(anio) AS max_anio FROM police_reports WHERE departamento = $1`,
        [depto]
      );
      anioFinal = Number(yearRows[0]?.max_anio) || 2024;
    }

    const condiciones: string[] = [];
    const params: unknown[] = [anioFinal, depto];

    condiciones.push(`pr.anio = $1`);
    condiciones.push(`pr.departamento = $2`);

    if (provincia) {
      params.push(provincia.toUpperCase());
      condiciones.push(`pr.provincia = $${params.length}`);
    }
    if (modalidad) {
      params.push(modalidad);
      condiciones.push(`pr.modalidad = $${params.length}`);
    }
    const where = `WHERE ${condiciones.join(" AND ")}`;

    // Verificar que poblacion_departamental esté disponible
    const { rows: pobRows } = await pool.query(
      `SELECT poblacion, fuente, vintage FROM poblacion_departamental WHERE departamento = $1`,
      [depto]
    );

    if (pobRows.length === 0) {
      res.status(422).json({
        error: `No hay población departamental para "${depto}". La tabla poblacion_departamental debe estar poblada antes de usar este índice.`,
        departamento: depto,
        detalle: "Verificar que se corrió la ingesta de población departamental.",
      });
      return;
    }

    const { poblacion, fuente, vintage } = pobRows[0];

    // Denuncias agregadas por modalidad × provincia (dentro del departamento)
    // Si hay filtro de provincia, agrega por modalidad; si no, agrega por modalidad
    // a nivel departamental
    const nivelAgr = provincia ? "provincia" : "departamento";

    const { rows: denuncias } = await pool.query(
      `SELECT
         ${nivelAgr === "provincia" ? "pr.provincia" : "pr.departamento"} AS nivel_geo,
         pr.modalidad,
         SUM(pr.cantidad) AS total_denuncias,
         COUNT(DISTINCT pr.distrito) AS distritos_activos
       FROM police_reports pr
       ${where}
       GROUP BY ${nivelAgr === "provincia" ? "pr.provincia" : "pr.departamento"}, pr.modalidad
       ORDER BY ${nivelAgr === "provincia" ? "pr.provincia" : "pr.departamento"}, pr.modalidad`,
      params
    );

    if (denuncias.length === 0) {
      res.status(404).json({
        error: "Sin datos de denuncias para los filtros dados.",
        anio: anioFinal,
        departamento: depto,
      });
      return;
    }

    // Sin población a nivel provincia, dividir el numerador de una provincia
    // por la población de TODO el departamento infla artificialmente la tasa
    // (bug confirmado por CodeRabbit). La tasa solo es válida a nivel
    // departamental; a nivel provincia se devuelve null explícito.
    const resultados = denuncias.map((r) => {
      const tasa =
        nivelAgr === "departamento"
          ? Math.round((Number(r.total_denuncias) / Number(poblacion)) * 10000 * 10) / 10
          : null;
      return {
        nivelGeo: r.nivel_geo,
        modalidad: r.modalidad,
        totalDenuncias: Number(r.total_denuncias),
        distritosActivos: Number(r.distritos_activos),
        poblacion: nivelAgr === "departamento" ? Number(poblacion) : null,
        tasaPor10mil: tasa,
        fuentePoblacion: nivelAgr === "departamento" ? fuente : null,
        vintage: nivelAgr === "departamento" ? vintage : null,
        // Se completan abajo, por grupo de nivelGeo — declarados acá para que
        // el tipo del array los incluya desde el inicio.
        ranking: null as number | null,
        totalModalidades: null as number | null,
      };
    });

    // Ranking: percentil dentro del grupo de modalidades del mismo nivel geo.
    // A nivel provincia no hay tasa (ver arriba) — se ordena por total de
    // denuncias en su lugar, que sigue siendo comparable entre modalidades
    // de la misma provincia.
    const grupos = new Map<string, typeof resultados>();
    for (const r of resultados) {
      if (!grupos.has(r.nivelGeo)) grupos.set(r.nivelGeo, []);
      grupos.get(r.nivelGeo)!.push(r);
    }

    for (const [, grupo] of grupos) {
      grupo.sort((a, b) =>
        nivelAgr === "departamento"
          ? (b.tasaPor10mil ?? 0) - (a.tasaPor10mil ?? 0)
          : b.totalDenuncias - a.totalDenuncias
      );
      for (let i = 0; i < grupo.length; i++) {
        const item = resultados.find((r) => r.nivelGeo === grupo[i].nivelGeo && r.modalidad === grupo[i].modalidad)!;
        item.ranking = i + 1;
        item.totalModalidades = grupo.length;
      }
    }

    // Ordenar resultados
    if (orden === "tasa_desc") {
      resultados.sort((a, b) => (b.tasaPor10mil ?? -1) - (a.tasaPor10mil ?? -1));
    } else if (orden === "tasa_asc") {
      resultados.sort((a, b) => (a.tasaPor10mil ?? 999999) - (b.tasaPor10mil ?? 999999));
    } else if (orden === "denuncias_desc") {
      resultados.sort((a, b) => b.totalDenuncias - a.totalDenuncias);
    } else {
      resultados.sort((a, b) => {
        const geoDiff = a.nivelGeo.localeCompare(b.nivelGeo);
        if (geoDiff !== 0) return geoDiff;
        return a.modalidad.localeCompare(b.modalidad);
      });
    }

    // Resumen por modalidad (agregado departamental) — solo tiene sentido con
    // tasas reales, así que se omite cuando se filtró por provincia.
    const resumenModalidades =
      nivelAgr === "departamento"
        ? (() => {
            const porModalidad = new Map<string, { denuncias: number; tasas: number[]; niveles: number }>();
            for (const r of resultados) {
              const existing = porModalidad.get(r.modalidad) ?? { denuncias: 0, tasas: [], niveles: 0 };
              porModalidad.set(r.modalidad, {
                denuncias: existing.denuncias + r.totalDenuncias,
                tasas: [...existing.tasas, r.tasaPor10mil ?? 0],
                niveles: existing.niveles + 1,
              });
            }
            return [...porModalidad.entries()]
              .map(([modalidad, data]) => ({
                modalidad,
                totalDenuncias: data.denuncias,
                tasaPromedio:
                  data.niveles > 0
                    ? Math.round((data.tasas.reduce((a, b) => a + b, 0) / data.niveles) * 10) / 10
                    : null,
                departamentosActivos: data.niveles,
              }))
              .sort((a, b) => (b.tasaPromedio ?? 0) - (a.tasaPromedio ?? 0));
          })()
        : [];

    res.json({
      meta: {
        cobertura: "Nacional (SIDPOL/MININTER)",
        fuentePoblacion: fuente,
        vintage,
        metodologia:
          "Tasa = (total_denuncias × 10,000) / poblacion_departamento. Población = padrón electoral RENIEC 2026 (mayores de 18 años). Solo disponible a nivel departamento — no hay población provincial.",
        limitaciones: [
          "SIDPOL mide solo denuncias hechas en comisaría — no incluye hechos no denunciados.",
          "Un departamento con alta tasa puede reflejar buena cultura de denuncia, no necesariamente más criminalidad.",
          "La modalidad puede variar de clasificación entre años.",
          "La población es proxy (mayores de 18 años) — excluye menores.",
          "La agregación es departamental: diferencias intra-departamentales (provincias/distritos) no se capturan en la tasa.",
          "Al filtrar por provincia, tasaPor10mil es null (no hay población provincial) — solo se muestra totalDenuncias.",
        ],
        filtros: { anio: anioFinal, departamento: depto, provincia: provincia ?? null, modalidad: modalidad ?? null },
        nivelGeografico: nivelAgr,
        stats: {
          totalFilas: resultados.length,
          modalidadesUnicas: new Set(resultados.map((r) => r.modalidad)).size,
          poblacionDepartamental: Number(poblacion),
        },
      },
      resumenPorModalidad: resumenModalidades,
      resultados,
    });
  })
);

/**
 * Comparativo anual: cómo cambió la tasa de denuncias de un departamento entre dos años.
 * Responde: ¿en qué departamentos la inseguridad empeoró o mejoró más?
 */
const ComparativoQuerySchema = z.object({
  /** Departamento (texto exacto, sensibilidad a mayúsculas). Default: LA LIBERTAD. */
  departamento: z.string().min(1).default("LA LIBERTAD"),
  /** Primer año. Default: anterior al año máximo en la tabla. */
  anioInicio: z.coerce.number().int().min(2018).max(2100).optional(),
  /** Último año. Default: año máximo en la tabla. */
  anioFin: z.coerce.number().int().min(2018).max(2100).optional(),
});

indiceDenunciasRouter.get(
  "/comparativo",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ComparativoQuerySchema, req.query, res);
    if (!parsed) return;

    const { departamento, anioInicio, anioFin } = parsed;
    const depto = departamento.toUpperCase();

    // Años disponibles PARA ESE DEPARTAMENTO — antes se tomaba el rango de
    // TODA la tabla (todos los departamentos), así que el default de
    // anioInicio/anioFin podía caer en años sin ningún dato para `depto`
    // (bug confirmado por CodeRabbit: "toma los años por defecto de la
    // tabla completa, no del departamento solicitado").
    const { rows: yearRows } = await pool.query(
      `SELECT DISTINCT anio FROM police_reports WHERE departamento = $1 ORDER BY anio`,
      [depto]
    );
    const aniosDisponibles = yearRows.map((r) => Number(r.anio));

    if (aniosDisponibles.length === 0) {
      res.status(404).json({ error: `Sin datos en police_reports para "${depto}".` });
      return;
    }

    const anioFinReal = anioFin ?? Math.max(...aniosDisponibles);
    const anioInicioReal = anioInicio ?? Math.min(...aniosDisponibles);

    if (anioFinReal <= anioInicioReal) {
      res.status(400).json({ error: "anioFin debe ser mayor que anioInicio." });
      return;
    }

    // Denuncias por año × modalidad (agregadas a nivel departamental)
    const { rows: series } = await pool.query(
      `SELECT
         pr.anio,
         pr.modalidad,
         SUM(pr.cantidad) AS total_denuncias
       FROM police_reports pr
       WHERE pr.departamento = $1
         AND pr.anio BETWEEN $2 AND $3
       GROUP BY pr.anio, pr.modalidad
       ORDER BY pr.anio, pr.modalidad`,
      [depto, anioInicioReal, anioFinReal]
    );

    if (series.length === 0) {
      res.status(404).json({ error: `Sin datos para el departamento "${depto}".` });
      return;
    }

    // Población del departamento
    const { rows: pobRows } = await pool.query(
      `SELECT poblacion, fuente, vintage FROM poblacion_departamental WHERE departamento = $1`,
      [depto]
    );

    if (pobRows.length === 0) {
      res.status(422).json({
        error: `No hay población departamental para "${depto}".`,
        departamento: depto,
      });
      return;
    }

    const poblacion = Number(pobRows[0].poblacion);
    const { fuente, vintage } = pobRows[0];

    const seriesConTasa = series.map((r) => ({
      anio: Number(r.anio),
      modalidad: r.modalidad,
      totalDenuncias: Number(r.total_denuncias),
      tasaPor10mil:
        Math.round((Number(r.total_denuncias) / poblacion) * 10000 * 10) / 10,
    }));

    // Evolución por modalidad
    const modalidades = [...new Set(series.map((r) => r.modalidad))];
    const evolucion = modalidades.map((modalidad) => {
      const puntos = seriesConTasa.filter((r) => r.modalidad === modalidad);
      const primerAnio = puntos.find((r) => r.anio === anioInicioReal);
      const ultimoAnio = puntos.find((r) => r.anio === anioFinReal);

      // `variacionPct` se calcula sobre `totalDenuncias` (conteo crudo), no
      // sobre `tasaPor10mil` (ya redondeada a 1 decimal) — la población es
      // constante entre años para el mismo departamento, así que el % de
      // variación es idéntico en ambos casos, pero partir del conteo crudo
      // evita amplificar el error de redondeo de la tasa (bug confirmado
      // por CodeRabbit).
      const variacion =
        primerAnio !== undefined && ultimoAnio !== undefined && primerAnio.totalDenuncias !== 0
          ? Math.round(
              ((ultimoAnio.totalDenuncias - primerAnio.totalDenuncias) / primerAnio.totalDenuncias) * 1000
            ) / 10
          : null;

      return {
        modalidad,
        tasaInicio: primerAnio?.tasaPor10mil ?? null,
        tasaFin: ultimoAnio?.tasaPor10mil ?? null,
        variacionPct: variacion,
        tendencia:
          variacion === null
            ? null
            : variacion > 20
              ? "EMPEORO_SIGNIFICATIVO"
              : variacion > 0
                ? "EMPEORO"
                : variacion > -20
                  ? "MEJORA"
                  : "MEJORA_SIGNIFICATIVA",
      };
    });

    res.json({
      meta: {
        departamento: depto,
        anios: { inicio: anioInicioReal, fin: anioFinReal },
        poblacion,
        fuentePoblacion: fuente,
        vintage,
        limitacion:
          "Variación > 0 no necesariamente significa más criminalidad — puede ser más denuncias. Población = padrón electoral 2026 (proxy mayores de 18 años). variacionPct se calcula sobre el conteo crudo de denuncias, no sobre la tasa redondeada.",
      },
      evolucion,
      series: seriesConTasa,
    });
  })
);

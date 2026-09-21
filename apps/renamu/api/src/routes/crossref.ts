import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { inversionesPool } from "../db/inversiones-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  ubigeo: z.string().min(1).optional(),
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
});

interface InvestmentAgg {
  ubigeo: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  inversiones: number;
  montoViableTotal: number;
  costoActualizadoTotal: number;
}

interface CapacidadAgg {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  anio: number;
  tieneVehiculoOperativo: boolean | null;
  tieneInternet: boolean | null;
}

/**
 * Cruce inversión pública ejecutada POR el gobierno local (Invierte.pe/CUI,
 * `nivel = 'GL'`) <-> capacidad institucional real de esa municipalidad
 * (RENAMU: ¿tiene al menos un vehículo operativo?, ¿tiene internet?),
 * agregado por UBIGEO exacto — mismo patrón que `servicios-salud`/
 * `programas-sociales` (investments por ubigeo, sin matcher difuso, ambos
 * lados ya comparten la misma columna).
 *
 * Se filtra a `nivel = 'GL'` (no GN/GR) a propósito: RENAMU mide la
 * capacidad de LA MUNICIPALIDAD misma, así que el cruce relevante es la
 * inversión que ELLA ejecuta, no cualquier inversión nacional/regional que
 * caiga en su distrito (eso respondería una pregunta distinta).
 *
 * Verificado en vivo 2026-09-21: `investments` (nivel=GL) solo cubre 374
 * distritos (LIMA, LA LIBERTAD, AREQUIPA) de los 1,891 de RENAMU — no es
 * cobertura nacional, ver `coberturaInversion` en la respuesta.
 *
 * Se excluyen filas con `distrito = '- TODOS -'` (18 de 24,644 GL): son
 * agregados provinciales/departamentales de la fuente (ubigeo terminado en
 * "00"), no distritos reales, y nunca calzarán contra una municipalidad de
 * RENAMU -- incluirlas generaría falsos "puntos ciegos".
 */
crossrefRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
    if (!parsed) return;
    const departamento = parsed.departamento?.toUpperCase().trim();
    const ubigeo = parsed.ubigeo?.trim();
    const anio = parsed.anio;

    const { rows: coberturaRows } = await inversionesPool.query<{ departamento: string }>(
      "SELECT DISTINCT departamento FROM investments WHERE nivel = 'GL' AND departamento IS NOT NULL ORDER BY departamento"
    );
    const departamentosConInversion = coberturaRows.map((r) => r.departamento);

    const invConditions = ["nivel = 'GL'", "ubigeo IS NOT NULL", "distrito <> '- TODOS -'"];
    const invParams: unknown[] = [];
    if (departamento) {
      invParams.push(departamento);
      invConditions.push(`departamento = $${invParams.length}`);
    }
    if (ubigeo) {
      invParams.push(ubigeo);
      invConditions.push(`ubigeo = $${invParams.length}`);
    }

    const { rows: invRows } = await inversionesPool.query<{
      ubigeo: string;
      departamento: string;
      provincia: string | null;
      distrito: string | null;
      inversiones: string;
      monto_viable_total: string;
      costo_actualizado_total: string;
    }>(
      `SELECT ubigeo, departamento, provincia, distrito,
              COUNT(*) AS inversiones,
              COALESCE(SUM(monto_viable), 0) AS monto_viable_total,
              COALESCE(SUM(costo_actualizado), 0) AS costo_actualizado_total
       FROM investments
       WHERE ${invConditions.join(" AND ")}
       GROUP BY ubigeo, departamento, provincia, distrito`,
      invParams
    );

    // Mismo criterio DQ-16 que GET /api/municipalidades: sin `anio`
    // explícito, solo el año más reciente ingerido -- la tabla es un panel
    // multi-año, mezclar años inflaría/mezclaría capacidad instalada de
    // cortes distintos.
    const capConditions = ["m.anio = COALESCE($1::int, (SELECT MAX(anio) FROM renamu_municipalidades))"];
    const capParams: unknown[] = [anio ?? null];
    if (departamento) {
      capParams.push(departamento);
      capConditions.push(`m.departamento = $${capParams.length}`);
    }
    if (ubigeo) {
      capParams.push(ubigeo);
      capConditions.push(`m.ubigeo = $${capParams.length}`);
    }

    const { rows: capRows } = await pool.query<{
      ubigeo: string;
      departamento: string;
      provincia: string;
      distrito: string;
      anio: number;
      tiene_vehiculo_operativo: boolean | null;
      tiene_internet: boolean | null;
    }>(
      `SELECT m.ubigeo, m.departamento, m.provincia, m.distrito, m.anio,
              bool_or(v.tiene AND v.cantidad_operativa > 0) AS tiene_vehiculo_operativo,
              c.tiene_internet
       FROM renamu_municipalidades m
       LEFT JOIN renamu_vehiculos v ON v.municipio_id = m.id
       LEFT JOIN renamu_conectividad c ON c.municipio_id = m.id
       WHERE ${capConditions.join(" AND ")}
       GROUP BY m.ubigeo, m.departamento, m.provincia, m.distrito, m.anio, c.tiene_internet`,
      capParams
    );

    const investmentsByUbigeo = new Map<string, InvestmentAgg>(
      invRows.map((r) => [
        r.ubigeo,
        {
          ubigeo: r.ubigeo,
          departamento: r.departamento,
          provincia: r.provincia,
          distrito: r.distrito,
          inversiones: Number(r.inversiones),
          montoViableTotal: Number(r.monto_viable_total),
          costoActualizadoTotal: Number(r.costo_actualizado_total),
        },
      ])
    );
    const capacidadByUbigeo = new Map<string, CapacidadAgg>(
      capRows.map((r) => [
        r.ubigeo,
        {
          ubigeo: r.ubigeo,
          departamento: r.departamento,
          provincia: r.provincia,
          distrito: r.distrito,
          anio: r.anio,
          tieneVehiculoOperativo: r.tiene_vehiculo_operativo,
          tieneInternet: r.tiene_internet,
        },
      ])
    );

    // A diferencia de servicios-salud/programas-sociales (que unen ambos
    // lados), acá solo interesan los distritos con inversión GL real -- sin
    // eso no hay pregunta "¿la inversión se tradujo en capacidad?" que
    // responder, solo ruido de las ~1,500 municipalidades sin inversión
    // registrada en esta fuente todavía.
    const resultados = [...investmentsByUbigeo.keys()]
      .map((u) => {
        const inv = investmentsByUbigeo.get(u)!;
        const cap = capacidadByUbigeo.get(u) ?? null;
        return {
          ubigeo: u,
          departamento: inv.departamento,
          provincia: inv.provincia,
          distrito: inv.distrito,
          inversionGL: {
            inversiones: inv.inversiones,
            montoViableTotal: inv.montoViableTotal,
            costoActualizadoTotal: inv.costoActualizadoTotal,
          },
          capacidad: cap ? { anio: cap.anio, tieneVehiculoOperativo: cap.tieneVehiculoOperativo, tieneInternet: cap.tieneInternet } : null,
          // Hay inversión GL registrada pero RENAMU no encontró la
          // municipalidad (sin dato de capacidad) o la municipalidad no
          // tiene ni vehículo operativo ni internet -- capacidad mínima
          // pese a estar ejecutando inversión propia.
          puntoCiego: !cap || (cap.tieneVehiculoOperativo !== true && cap.tieneInternet !== true),
        };
      })
      .sort((a, b) => b.inversionGL.montoViableTotal - a.inversionGL.montoViableTotal);

    res.json({
      coberturaInversion: {
        departamentosConDatos: departamentosConInversion,
        nota: "investments (radar-inversiones, nivel=GL) no cubre todo el país por diseño -- un distrito sin inversión aquí puede ser un distrito no ingerido todavía en esa fuente, no necesariamente un distrito sin inversión real ejecutada por su municipalidad. Se excluyen registros con distrito='- TODOS -' (agregados provinciales/departamentales de la fuente, no distritos reales).",
      },
      resultados,
    });
  })
);

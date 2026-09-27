/**
 * routes/equipamiento.ts
 *
 * Endpoints de solo lectura para el equipamiento PNP adquirido vía SEACE.
 * Vive en su propio archivo (y no junto a comisarías) porque la introspección de
 * rutas del MCP (mcp-server/src/route-introspection.ts) deriva los GET reales a
 * nivel de ARCHIVO: con dos routers en un mismo archivo, cada prefijo de `app.use`
 * heredaba los handlers del otro y el catálogo MCP reportaba rutas fantasma.
 */

import { Router, type Request, type Response } from "express";
import { pool } from "../db/pool.js";

export const equipamientoRouter = Router();

/**
 * GET /api/equipamiento
 * Equipamiento PNP por año y tipo (SEACE)
 * 
 * Parámetros query:
 *   - anio_desde: año de inicio (default: 2020)
 *   - anio_hasta: año de fin (default: 2026)
 *   - tipo: filtro tipo (VEHICULO|ARMAMENTO|COMUNICACIONES|EQUIPAMIENTO_SEGURIDAD)
 *   - limit: número de resultados
 *   - offset: paginación
 */
equipamientoRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { anio_desde = 2020, anio_hasta = 2026, tipo, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT 
        id,
        anio,
        tipo_equipamiento,
        cantidad_comprada,
        monto_soles,
        proveedor,
        contrato_seace_id,
        contrato_url,
        observacion,
        ingestion_date
      FROM pnp_equipamiento_seace
      WHERE anio BETWEEN $1 AND $2
    `;

    const params: any[] = [anio_desde, anio_hasta];

    if (tipo) {
      query += ` AND tipo_equipamiento = $${params.length + 1}`;
      params.push(tipo);
    }

    query += ` ORDER BY anio DESC, monto_soles DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Agregar resumen por tipo si no hay filtro específico
    let resumen = null;
    if (!tipo) {
      const resumenResult = await pool.query(
        `
        SELECT 
          tipo_equipamiento,
          SUM(cantidad_comprada) as total_contratos,
          SUM(monto_soles) as monto_total
        FROM pnp_equipamiento_seace
        WHERE anio BETWEEN $1 AND $2
        GROUP BY tipo_equipamiento
        ORDER BY monto_total DESC;
        `,
        [anio_desde, anio_hasta]
      );
      resumen = resumenResult.rows;
    }

    res.json({
      total: result.rows.length,
      limit,
      offset,
      resumen,
      equipamiento: result.rows,
    });
  } catch (err) {
    console.error("Error en GET /api/equipamiento:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * GET /api/equipamiento/resumen
 * Resumen agregado de inversión PNP por año
 */
equipamientoRouter.get("/resumen", async (req: Request, res: Response) => {
  try {
    const { anio_desde = 2020, anio_hasta = 2026 } = req.query;

    const result = await pool.query(
      `
      SELECT 
        anio,
        SUM(cantidad_comprada) as total_contratos,
        SUM(monto_soles) as monto_total
      FROM pnp_equipamiento_seace
      WHERE anio BETWEEN $1 AND $2
      GROUP BY anio
      ORDER BY anio DESC;
      `,
      [anio_desde, anio_hasta]
    );

    res.json({
      periodo: { desde: anio_desde, hasta: anio_hasta },
      resumen_anual: result.rows,
    });
  } catch (err) {
    console.error("Error en GET /api/equipamiento/resumen:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

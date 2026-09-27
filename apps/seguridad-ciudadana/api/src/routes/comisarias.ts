/**
 * routes/comisarias.ts
 * 
 * Endpoints de solo lectura para comisarías auditadas + equipamiento PNP
 */

import { Router, type Request, type Response } from "express";
import { pool } from "../db/pool.js";

export const comisariasRouter = Router();

/**
 * GET /api/comisarias
 * Lista comisarías auditadas en Lima con hallazgos de Contraloría
 * 
 * Parámetros query:
 *   - departamento: filtro departamento (default: LIMA)
 *   - distrito: filtro distrito (opcional)
 *   - severidad: filtro por severidad de hallazgos (critica|mayor|menor)
 *   - limit: número de resultados (default: 100)
 *   - offset: paginación (default: 0)
 */
comisariasRouter.get("/", async (req: Request, res: Response) => {
  try {
    const {
      departamento = "LIMA",
      distrito,
      severidad,
      limit = 100,
      offset = 0,
    } = req.query;

    let query = `
      SELECT 
        id,
        nombre,
        departamento,
        provincia,
        distrito,
        ubicacion_aprox,
        anio_auditoria,
        fuente_informe_id,
        fuente_informe_url,
        hallazgos,
        ultima_actualizacion
      FROM comisarias_auditadas
      WHERE departamento = $1
    `;

    const params: any[] = [departamento];

    if (distrito) {
      query += ` AND distrito = $${params.length + 1}`;
      params.push(distrito);
    }

    // Si se filtra por severidad, usa contains en JSONB
    if (severidad) {
      query += ` AND hallazgos @> $${params.length + 1}::jsonb`;
      params.push(JSON.stringify([{ severity: severidad }]));
    }

    query += ` ORDER BY ultima_actualizacion DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({
      total: result.rows.length,
      limit,
      offset,
      comisarias: result.rows,
    });
  } catch (err) {
    console.error("Error en GET /api/comisarias:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * GET /api/comisarias/:id
 * Detalle de una comisaría
 */
comisariasRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query("SELECT * FROM comisarias_auditadas WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Comisaría no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error en GET /api/comisarias/:id:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});


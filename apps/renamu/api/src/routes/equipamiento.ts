import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const equipamientoRouter = Router();

const EquipamientoQuerySchema = z.object({
  ubigeo: z
    .string()
    .regex(/^\d{6}$/, "ubigeo debe tener 6 dígitos"),
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
});

equipamientoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(EquipamientoQuerySchema, req.query, res);
    if (!parsed) return;
    const { ubigeo, anio } = parsed;

    const municipioParams: unknown[] = [ubigeo];
    let municipioWhere = "m.ubigeo = $1";
    if (anio) {
      municipioParams.push(anio);
      municipioWhere += ` AND m.anio = $${municipioParams.length}`;
    }

    const { rows: municipios } = await pool.query(
      `SELECT m.id, m.anio, m.ubigeo, m.departamento, m.provincia, m.distrito
       FROM renamu_municipalidades m
       WHERE ${municipioWhere}
       ORDER BY m.anio DESC
       LIMIT 1`,
      municipioParams
    );

    if (municipios.length === 0) {
      res.status(404).json({ error: "No hay datos de RENAMU para ese ubigeo/año." });
      return;
    }

    const municipio = municipios[0];

    const { rows: vehiculos } = await pool.query(
      `SELECT item_codigo, item_descripcion, tiene, cantidad_operativa, cantidad_no_operativa, especifique
       FROM renamu_vehiculos
       WHERE municipio_id = $1
       ORDER BY item_codigo`,
      [municipio.id]
    );

    const { rows: conectividad } = await pool.query(
      `SELECT tiene_linea_fija, lineas_fijas, tiene_linea_movil, lineas_moviles,
              tiene_internet, computadoras_con_internet, tipo_conexion_codigo
       FROM renamu_conectividad
       WHERE municipio_id = $1`,
      [municipio.id]
    );

    res.json({
      municipalidad: {
        anio: municipio.anio,
        ubigeo: municipio.ubigeo,
        departamento: municipio.departamento,
        provincia: municipio.provincia,
        distrito: municipio.distrito,
      },
      vehiculos: vehiculos.map((v) => ({
        item: v.item_descripcion,
        tiene: v.tiene,
        cantidadOperativa: v.cantidad_operativa === null ? null : Number(v.cantidad_operativa),
        cantidadNoOperativa: v.cantidad_no_operativa === null ? null : Number(v.cantidad_no_operativa),
        especifique: v.especifique,
      })),
      conectividad: conectividad[0]
        ? {
            tieneLineaFija: conectividad[0].tiene_linea_fija,
            lineasFijas: conectividad[0].lineas_fijas === null ? null : Number(conectividad[0].lineas_fijas),
            tieneLineaMovil: conectividad[0].tiene_linea_movil,
            lineasMoviles: conectividad[0].lineas_moviles === null ? null : Number(conectividad[0].lineas_moviles),
            tieneInternet: conectividad[0].tiene_internet,
            computadorasConInternet:
              conectividad[0].computadoras_con_internet === null ? null : Number(conectividad[0].computadoras_con_internet),
            tipoConexionCodigo: conectividad[0].tipo_conexion_codigo,
          }
        : null,
      fuente: { dataset: "INEI - RENAMU (Módulo II: equipamiento y TIC)" },
    });
  })
);

import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const conformacionRouter = Router();

conformacionRouter.get("/:ruc", asyncHandler(async (req, res) => {
  const { ruc } = req.params;

  const lookup = await pool.query(
    `SELECT ruc, cod_prov, razon_social, tipo_empresa, estado_sunat, condicion_sunat, tiene_socios, fetched_at
     FROM supplier_conformacion_lookup WHERE ruc = $1`,
    [ruc]
  );

  if (lookup.rows.length === 0) {
    res.status(404).json({ error: "RUC no consultado en conformación societaria (aún no ingerido)." });
    return;
  }

  const { rows } = await pool.query(
    `SELECT rol, nombre, tipo_documento, numero_documento, cargo, numero_acciones, porcentaje_acciones, fecha_ingreso
     FROM supplier_conformacion WHERE ruc = $1 ORDER BY rol, nombre`,
    [ruc]
  );

  const l = lookup.rows[0];
  res.json({
    ruc: l.ruc,
    codProv: l.cod_prov,
    razonSocial: l.razon_social,
    tipoEmpresa: l.tipo_empresa,
    estadoSunat: l.estado_sunat,
    condicionSunat: l.condicion_sunat,
    tieneSocios: l.tiene_socios,
    socios: rows.filter((r) => r.rol === "SOCIO").map((r) => ({
      nombre: r.nombre, tipoDocumento: r.tipo_documento, numeroDocumento: r.numero_documento,
      numeroAcciones: r.numero_acciones === null ? null : Number(r.numero_acciones),
      porcentajeAcciones: r.porcentaje_acciones === null ? null : Number(r.porcentaje_acciones),
      fechaIngreso: r.fecha_ingreso,
    })),
    representantes: rows.filter((r) => r.rol === "REPRESENTANTE").map((r) => ({
      nombre: r.nombre, tipoDocumento: r.tipo_documento, numeroDocumento: r.numero_documento, cargo: r.cargo, fechaIngreso: r.fecha_ingreso,
    })),
    organosAdministracion: rows.filter((r) => r.rol === "ORGANO_ADMINISTRACION").map((r) => ({
      nombre: r.nombre, tipoDocumento: r.tipo_documento, numeroDocumento: r.numero_documento, cargo: r.cargo, fechaIngreso: r.fecha_ingreso,
    })),
    limitacion: l.tiene_socios
      ? null
      : "Sin socios registrados en esta fuente — usual para consorcios (Contratos de Colaboración Empresarial), que no tienen accionistas en el sentido societario que expone este endpoint.",
    fuente: { dataset: "OSCE — Buscador de Proveedores del Estado (perfilprov)", extraidoEl: l.fetched_at },
  });
}));

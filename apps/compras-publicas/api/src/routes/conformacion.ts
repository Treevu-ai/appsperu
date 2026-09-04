import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const conformacionRouter = Router();

// Enmascara el número de documento (DNI/CE) de personas naturales antes de
// exponerlo — solo quedan visibles los últimos 3 dígitos. El dato completo
// se conserva en `supplier_conformacion` para uso interno (deduplicación,
// cruce entre RUCs); la API pública no necesita el DNI completo para su
// caso de uso de transparencia, y publicarlo íntegro eleva el riesgo de
// suplantación si se extrae en bloque.
function maskDocumento(numero: string | null): string | null {
  if (!numero || numero.length <= 3) return numero;
  return `${"*".repeat(numero.length - 3)}${numero.slice(-3)}`;
}

// Debe ir antes de "/:ruc" — si no, Express interpretaría "vinculos" como RUC.
interface VinculoRow {
  numero_documento: string;
  nombre: string;
  ruc: string;
  entidad: string | null;
  proceso: string;
  fecha: string | null;
  monto: string | null;
  fuente: string;
}

conformacionRouter.get("/vinculos", asyncHandler(async (_req, res) => {
  const { rows } = await pool.query<VinculoRow>(
    `SELECT numero_documento, nombre, ruc, entidad, proceso, fecha, monto, fuente
     FROM vw_conformacion_multi_ruc_awards
     ORDER BY numero_documento, fecha`
  );

  const porPersona = new Map<
    string,
    { numeroDocumento: string | null; nombre: string; adjudicaciones: Array<Record<string, unknown>> }
  >();

  for (const r of rows) {
    if (!porPersona.has(r.numero_documento)) {
      porPersona.set(r.numero_documento, {
        numeroDocumento: maskDocumento(r.numero_documento),
        nombre: r.nombre.trim(),
        adjudicaciones: [],
      });
    }
    porPersona.get(r.numero_documento)!.adjudicaciones.push({
      ruc: r.ruc,
      entidad: r.entidad,
      proceso: r.proceso,
      fecha: r.fecha,
      monto: r.monto === null ? null : Number(r.monto),
      fuente: r.fuente,
    });
  }

  const personas = Array.from(porPersona.values())
    .map((p) => ({
      ...p,
      rucsDistintos: new Set(p.adjudicaciones.map((a) => a.ruc)).size,
      entidadesDistintas: new Set(p.adjudicaciones.map((a) => a.entidad)).size,
    }))
    // Solo el patrón de interés: RUCs distintos ganando en entidades distintas.
    // Una sola empresa con varios contratos de la misma entidad no cuenta.
    .filter((p) => p.rucsDistintos > 1 && p.entidadesDistintas > 1);

  res.json({
    personas,
    limitacion:
      "Vínculo societario entre RUCs distintos que ganaron adjudicaciones en " +
      "entidades convocantes distintas. No implica irregularidad por sí solo " +
      "— es legal que una persona controle o represente a varias empresas. " +
      "Es una hipótesis para investigar con más contexto, no una conclusión.",
    fuente: {
      dataset: "Cruce interno: OSCE perfilprov (conformación societaria) + OCDS/menor a 8 UIT (adjudicaciones)",
    },
  });
}));

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
    `SELECT rol, nombre, tipo_documento, numero_documento, cargo, fecha_ingreso
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
      nombre: r.nombre.trim(), tipoDocumento: r.tipo_documento, numeroDocumento: maskDocumento(r.numero_documento),
      fechaIngreso: r.fecha_ingreso,
    })),
    representantes: rows.filter((r) => r.rol === "REPRESENTANTE").map((r) => ({
      nombre: r.nombre.trim(), tipoDocumento: r.tipo_documento, numeroDocumento: maskDocumento(r.numero_documento), cargo: r.cargo, fechaIngreso: r.fecha_ingreso,
    })),
    organosAdministracion: rows.filter((r) => r.rol === "ORGANO_ADMINISTRACION").map((r) => ({
      nombre: r.nombre.trim(), tipoDocumento: r.tipo_documento, numeroDocumento: maskDocumento(r.numero_documento), cargo: r.cargo, fechaIngreso: r.fecha_ingreso,
    })),
    limitacion: l.tiene_socios
      ? null
      : "Sin socios registrados en esta fuente — usual para consorcios (Contratos de Colaboración Empresarial), que no tienen accionistas en el sentido societario que expone este endpoint.",
    fuente: { dataset: "OSCE — Buscador de Proveedores del Estado (perfilprov)", extraidoEl: l.fetched_at },
  });
}));

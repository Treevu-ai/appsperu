import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { maskDocumento } from "./_helpers.js";

interface VinculoRow extends NeonRow {
  numero_documento: string;
  nombre: string;
  ruc: string;
  entidad: string | null;
  proceso: string;
  fecha: string | null;
  monto: string | null;
  fuente: string;
}

interface ConformacionLookupRow extends NeonRow {
  ruc: string;
  cod_prov: string | null;
  razon_social: string | null;
  tipo_empresa: string | null;
  estado_sunat: string | null;
  condicion_sunat: string | null;
  tiene_socios: boolean | null;
  fetched_at: string | null;
}

interface ConformacionRow extends NeonRow {
  rol: string;
  nombre: string;
  tipo_documento: string | null;
  numero_documento: string | null;
  cargo: string | null;
  fecha_ingreso: string | null;
}

export async function vinculos(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<VinculoRow>(
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
    .filter((p) => p.rucsDistintos > 1 && p.entidadesDistintas > 1);

  return {
    status: 200,
    body: {
      personas,
      limitacion:
        "Vínculo societario entre RUCs distintos que ganaron adjudicaciones en " +
        "entidades convocantes distintas. No implica irregularidad por sí solo " +
        "— es legal que una persona controle o represente a varias empresas. " +
        "Es una hipótesis para investigar con más contexto, no una conclusión.",
      fuente: {
        dataset: "Cruce interno: OSCE perfilprov (conformación societaria) + OCDS/menor a 8 UIT (adjudicaciones)",
      },
    },
  };
}

export async function byRuc(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ruc = args.ruc as string;

  const lookup = await db.query<ConformacionLookupRow>(
    `SELECT ruc, cod_prov, razon_social, tipo_empresa, estado_sunat, condicion_sunat, tiene_socios, fetched_at
     FROM supplier_conformacion_lookup WHERE ruc = $1`,
    [ruc]
  );

  if (lookup.rows.length === 0) {
    return { status: 404, body: { error: "RUC no consultado en conformación societaria (aún no ingerido)." } };
  }

  const { rows } = await db.query<ConformacionRow>(
    `SELECT rol, nombre, tipo_documento, numero_documento, cargo, fecha_ingreso
     FROM supplier_conformacion WHERE ruc = $1 ORDER BY rol, nombre`,
    [ruc]
  );

  const l = lookup.rows[0];
  return {
    status: 200,
    body: {
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
    },
  };
}

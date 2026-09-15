import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { candidatosPool } from "../db/candidatos-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const candidatosSancionadosRouter = Router();

/**
 * OE-03 (docs/PRD_Observatorio_Electoral_y_Riesgo_v1.md) — generaliza a
 * endpoint reusable lo que el 2026-09-10 se hizo a mano con un script de
 * Node fuera de la API: cruzar candidatos ERM 2026 (por departamento, o una
 * lista explícita de DNI) contra vínculos societarios (supplier_conformacion,
 * en compras-publicas) y sanciones directas (inhabilitaciones/multas, en
 * esta misma base) del Tribunal de Contrataciones.
 *
 * El cruce es siempre por DNI exacto, nunca por nombre. Mismo criterio de
 * `personas-sancionadas.ts`: el DNI se enmascara en toda respuesta (últimos
 * 3 dígitos visibles) — el nombre del candidato no se enmascara porque ya es
 * público por ley en su propia candidatura, no es un dato nuevo.
 *
 * Distinción deliberada, pedida explícitamente en el ticket: un vínculo
 * societario sin sanción en la empresa vinculada NO es lo mismo que una
 * sanción directa de la persona — se devuelven como dos listas separadas,
 * nunca fusionadas en una sola categoría de "hallazgo".
 */
function maskDocumento(numero: string): string {
  return numero.length <= 3 ? numero : `${"*".repeat(numero.length - 3)}${numero.slice(-3)}`;
}

const CandidatosSancionadosQuerySchema = z
  .object({
    departamento: z.string().min(1).optional(),
    dni: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.departamento) || Boolean(value.dni), {
    message: "Se requiere 'departamento' o 'dni' (lista separada por comas).",
  });

interface CandidatoRow {
  dni: string;
  nombre_completo: string;
  cargo: string;
  tipo_eleccion: string;
  organizacion_politica: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  estado: string;
}

interface SancionRow {
  dni: string | null;
  ruc: string;
  razon_social: string;
  estado: string | null;
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  tipo: "INHABILITACION" | "MULTA";
}

interface VinculoRow {
  numero_documento: string;
  ruc: string;
  nombre: string;
  rol: string;
  cargo: string | null;
  fecha_ingreso: string | Date | null;
}

candidatosSancionadosRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CandidatosSancionadosQuerySchema, req.query, res);
  if (!parsed) return;

  const dniFilter = parsed.dni ? parsed.dni.split(",").map((d) => d.trim()).filter(Boolean) : null;

  const { rows: candidatoRows } = await candidatosPool.query<CandidatoRow>(
    dniFilter
      ? `SELECT dni, nombre_completo, cargo, tipo_eleccion, organizacion_politica, departamento, provincia, distrito, estado
           FROM candidatos_erm WHERE estado = 'INSCRITO' AND dni = ANY($1)`
      : `SELECT dni, nombre_completo, cargo, tipo_eleccion, organizacion_politica, departamento, provincia, distrito, estado
           FROM candidatos_erm WHERE estado = 'INSCRITO' AND departamento = $1`,
    [dniFilter ?? parsed.departamento!.toUpperCase()]
  );

  if (candidatoRows.length === 0) {
    res.json({ resultados: [] });
    return;
  }

  const dnis = [...new Set(candidatoRows.map((r) => r.dni))];

  const [{ rows: sancionRows }, { rows: vinculoRows }] = await Promise.all([
    pool.query<SancionRow>(
      `SELECT dni, ruc, razon_social, estado, resolucion, desde, hasta, 'INHABILITACION'::text AS tipo
         FROM inhabilitaciones WHERE dni = ANY($1)
       UNION ALL
       SELECT dni, ruc, razon_social, estado, resolucion, desde, hasta, 'MULTA'::text AS tipo
         FROM multas WHERE dni = ANY($1)`,
      [dnis]
    ),
    comprasPool.query<VinculoRow>(
      `SELECT numero_documento, ruc, nombre, rol, cargo, fecha_ingreso
         FROM supplier_conformacion
        WHERE numero_documento = ANY($1) AND tipo_documento LIKE '%NACIONAL DE IDENTIDAD%'`,
      [dnis]
    ),
  ]);

  const vinculoRucs = [...new Set(vinculoRows.map((v) => v.ruc))];
  const { rows: empresaSancionRows } = vinculoRucs.length > 0
    ? await pool.query<SancionRow>(
        `SELECT NULL::text AS dni, ruc, razon_social, estado, resolucion, desde, hasta, 'INHABILITACION'::text AS tipo
           FROM inhabilitaciones WHERE ruc = ANY($1)
         UNION ALL
         SELECT NULL::text AS dni, ruc, razon_social, estado, resolucion, desde, hasta, 'MULTA'::text AS tipo
           FROM multas WHERE ruc = ANY($1)`,
        [vinculoRucs]
      )
    : { rows: [] as SancionRow[] };

  const sancionesDirectasPorDni = new Map<string, SancionRow[]>();
  for (const row of sancionRows) {
    if (!row.dni) continue;
    if (!sancionesDirectasPorDni.has(row.dni)) sancionesDirectasPorDni.set(row.dni, []);
    sancionesDirectasPorDni.get(row.dni)!.push(row);
  }

  const sancionesPorRuc = new Map<string, SancionRow[]>();
  for (const row of empresaSancionRows) {
    if (!sancionesPorRuc.has(row.ruc)) sancionesPorRuc.set(row.ruc, []);
    sancionesPorRuc.get(row.ruc)!.push(row);
  }

  const vinculosPorDni = new Map<string, VinculoRow[]>();
  for (const row of vinculoRows) {
    if (!vinculosPorDni.has(row.numero_documento)) vinculosPorDni.set(row.numero_documento, []);
    vinculosPorDni.get(row.numero_documento)!.push(row);
  }

  const resultados = candidatoRows
    .map((candidato) => {
      const vinculos = vinculosPorDni.get(candidato.dni) ?? [];
      const sancionesDirectas = sancionesDirectasPorDni.get(candidato.dni) ?? [];

      const vinculosEmpresariales = vinculos.map((v) => {
        const sancionesEmpresa = sancionesPorRuc.get(v.ruc) ?? [];
        return {
          ruc: v.ruc,
          nombreEnEmpresa: v.nombre.trim(),
          rol: v.rol,
          cargo: v.cargo,
          fechaIngreso: v.fecha_ingreso,
          empresaTieneSancion: sancionesEmpresa.length > 0,
          sancionesEmpresa: sancionesEmpresa.map((s) => ({
            tipo: s.tipo, resolucion: s.resolucion, estado: s.estado, desde: s.desde, hasta: s.hasta,
          })),
        };
      });

      if (vinculosEmpresariales.length === 0 && sancionesDirectas.length === 0) return null;

      return {
        dniEnmascarado: maskDocumento(candidato.dni),
        nombreCompleto: candidato.nombre_completo,
        cargo: candidato.cargo,
        tipoEleccion: candidato.tipo_eleccion,
        organizacionPolitica: candidato.organizacion_politica,
        departamento: candidato.departamento,
        provincia: candidato.provincia,
        distrito: candidato.distrito,
        vinculosEmpresariales,
        sancionesDirectas: sancionesDirectas.map((s) => ({
          tipo: s.tipo, rucSancionado: s.ruc, resolucion: s.resolucion, estado: s.estado, desde: s.desde, hasta: s.hasta,
        })),
        tieneSancionDirectaVigente: sancionesDirectas.some((s) => (s.estado ?? "").toUpperCase() === "VIGENTE"),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  res.json({
    candidatosRevisados: candidatoRows.length,
    resultados,
    limitacion:
      "Un vínculo societario sin sanción en la empresa vinculada no implica irregularidad — es legal que una persona controle o represente a varias empresas. La cobertura de vínculos societarios depende de cuántos RUC tiene ingeridos supplier_conformacion, no es el universo completo de empresas del país.",
  });
}));

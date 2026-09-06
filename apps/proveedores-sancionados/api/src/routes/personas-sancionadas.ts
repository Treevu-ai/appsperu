import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const personasSancionadasRouter = Router();

const PersonasSancionadasQuerySchema = z.object({
  soloVigentes: z.enum(["true", "false"]).optional(),
});

/**
 * Cruce persona-a-persona pedido por el usuario (2026-09-06): ¿una persona
 * sancionada directamente (RUC-10, persona natural, en `inhabilitaciones`
 * o `multas`) es también socio/representante/miembro del órgano de
 * administración de una empresa activa (`supplier_conformacion`,
 * compras-publicas)? El DNI de la persona sancionada ya vive incrustado en
 * su propio RUC-10 (migración 002) — este endpoint solo lo usa como clave
 * de cruce interno, nunca lo expone completo: se enmascara igual que
 * `numero_documento` en `compras-publicas/routes/conformacion.ts`
 * (`maskDocumento`, mismos últimos 3 dígitos visibles).
 *
 * El nombre de la persona sí se expone — no es un dato nuevo: el RNP ya
 * publica esa razón social (que para una persona natural ES su nombre) en
 * su propio buscador público, y este proyecto ya la expone en
 * `GET /api/sanciones` para cualquier fila, RUC-10 incluido. Lo nuevo aquí
 * no es el nombre, es la vinculación con una empresa distinta a través del
 * DNI.
 */
function maskDocumento(numero: string | null): string | null {
  if (!numero || numero.length <= 3) return numero;
  return `${"*".repeat(numero.length - 3)}${numero.slice(-3)}`;
}

interface SancionRow {
  dni: string;
  ruc: string;
  nombre: string;
  tipo: "INHABILITACION" | "MULTA";
  resolucion: string;
  estado: string | null;
  desde: string | Date | null;
  hasta: string | Date | null;
}

interface VinculoRow {
  numero_documento: string;
  nombre: string;
  rol: string;
  ruc: string;
  cargo: string | null;
  fecha_ingreso: string | Date | null;
}

personasSancionadasRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(PersonasSancionadasQuerySchema, req.query, res);
  if (!parsed) return;
  const soloVigentes = parsed.soloVigentes === "true";

  const { rows: sancionRows } = await pool.query<SancionRow>(
    `SELECT dni, ruc, razon_social AS nombre, 'INHABILITACION'::text AS tipo, resolucion, estado, desde, hasta
       FROM inhabilitaciones WHERE dni IS NOT NULL
     UNION ALL
     SELECT dni, ruc, razon_social AS nombre, 'MULTA'::text AS tipo, resolucion, estado, desde, hasta
       FROM multas WHERE dni IS NOT NULL`
  );

  const dnis = [...new Set(sancionRows.map((r) => r.dni))];
  let vinculoRows: VinculoRow[] = [];
  if (dnis.length > 0) {
    const result = await comprasPool.query<VinculoRow>(
      `SELECT numero_documento, nombre, rol, ruc, cargo, fecha_ingreso
         FROM supplier_conformacion
        WHERE numero_documento = ANY($1) AND tipo_documento LIKE '%NACIONAL DE IDENTIDAD%'`,
      [dnis]
    );
    vinculoRows = result.rows;
  }

  const sancionesByDni = new Map<string, SancionRow[]>();
  for (const row of sancionRows) {
    if (!sancionesByDni.has(row.dni)) sancionesByDni.set(row.dni, []);
    sancionesByDni.get(row.dni)!.push(row);
  }

  const vinculosByDni = new Map<string, VinculoRow[]>();
  for (const row of vinculoRows) {
    if (!vinculosByDni.has(row.numero_documento)) vinculosByDni.set(row.numero_documento, []);
    vinculosByDni.get(row.numero_documento)!.push(row);
  }

  const dnisConVinculo = [...vinculosByDni.keys()];

  const resultados = dnisConVinculo.map((dni) => {
    const sanciones = sancionesByDni.get(dni) ?? [];
    const vinculos = vinculosByDni.get(dni) ?? [];
    const tieneSancionVigente = sanciones.some((s) => (s.estado ?? "").toUpperCase() === "VIGENTE");

    return {
      dniEnmascarado: maskDocumento(dni),
      nombre: sanciones[0]?.nombre ?? vinculos[0]?.nombre ?? null,
      tieneSancionVigente,
      sanciones: sanciones.map((s) => ({
        tipo: s.tipo,
        rucSancionado: s.ruc,
        resolucion: s.resolucion,
        estado: s.estado,
        desde: s.desde,
        hasta: s.hasta,
      })),
      vinculosEmpresariales: vinculos.map((v) => ({
        ruc: v.ruc,
        nombreEnEmpresa: v.nombre,
        rol: v.rol,
        cargo: v.cargo,
        fechaIngreso: v.fecha_ingreso,
      })),
    };
  });

  res.json({
    resultados: soloVigentes ? resultados.filter((r) => r.tieneSancionVigente) : resultados,
  });
}));

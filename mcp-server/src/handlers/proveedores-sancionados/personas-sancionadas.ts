import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { maskDocumento, crossAppPool, crossAppUnavailable } from "./_helpers.js";

interface SancionRow extends NeonRow {
  dni: string;
  ruc: string;
  nombre: string;
  tipo: "INHABILITACION" | "MULTA";
  resolucion: string;
  estado: string | null;
  desde: string | Date | null;
  hasta: string | Date | null;
}

interface VinculoRow extends NeonRow {
  numero_documento: string;
  nombre: string;
  rol: string;
  ruc: string;
  cargo: string | null;
  fecha_ingreso: string | Date | null;
}

/**
 * Handler para `proveedores_sancionados_personas` —
 * GET /api/crossref/personas-sancionadas.
 *
 * ¿Una persona sancionada directamente (RUC-10, persona natural) es también
 * socio/representante/miembro del órgano de administración de una empresa activa
 * (`supplier_conformacion`)? El DNI solo se usa como clave de cruce interno y
 * nunca se expone completo: `dniEnmascarado` trae los últimos 3 dígitos. El
 * nombre sí se expone — es la razón social que el RNP ya publica en su propio
 * buscador, y que `GET /api/sanciones` ya devuelve para cualquier fila.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");

  const soloVigentes = args.soloVigentes === "true";

  const { rows: sancionRows } = await db.query<SancionRow>(
    `SELECT dni, ruc, razon_social AS nombre, 'INHABILITACION'::text AS tipo, resolucion, estado, desde, hasta
       FROM inhabilitaciones WHERE dni IS NOT NULL
     UNION ALL
     SELECT dni, ruc, razon_social AS nombre, 'MULTA'::text AS tipo, resolucion, estado, desde, hasta
       FROM multas WHERE dni IS NOT NULL`
  );

  const dnis = [...new Set(sancionRows.map((r) => r.dni))];
  let vinculoRows: VinculoRow[] = [];
  if (dnis.length > 0) {
    const result = await comprasDb.query<VinculoRow>(
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

  return {
    status: 200,
    body: {
      resultados: soloVigentes ? resultados.filter((r) => r.tieneSancionVigente) : resultados,
    },
  };
}

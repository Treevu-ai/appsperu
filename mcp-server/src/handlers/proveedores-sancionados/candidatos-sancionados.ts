import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { maskDocumento, crossAppPool, crossAppUnavailable } from "./_helpers.js";

interface CandidatoRow extends NeonRow {
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

interface SancionRow extends NeonRow {
  dni: string | null;
  ruc: string;
  razon_social: string;
  estado: string | null;
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  tipo: "INHABILITACION" | "MULTA";
}

interface VinculoRow extends NeonRow {
  numero_documento: string;
  ruc: string;
  nombre: string;
  rol: string;
  cargo: string | null;
  fecha_ingreso: string | Date | null;
}

/**
 * Handler para `proveedores_sancionados_candidatos_sancionados` —
 * GET /api/crossref/candidatos-sancionados.
 *
 * Cruza candidatos ERM (por departamento, o una lista explícita de DNI separada
 * por comas) contra vínculos societarios (`supplier_conformacion`) y sanciones
 * directas del Tribunal de Contrataciones. El cruce es siempre por DNI exacto,
 * nunca por nombre; el DNI se enmascara en toda respuesta.
 *
 * Un vínculo societario sin sanción en la empresa vinculada NO es lo mismo que
 * una sanción directa de la persona: se devuelven como dos listas separadas.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const candidatosDb = crossAppPool("candidatos-erm", env);
  if (!candidatosDb) return crossAppUnavailable("candidatos-erm");
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");

  const dniRaw = args.dni as string | undefined;
  const departamentoRaw = args.departamento as string | undefined;

  if (!dniRaw && !departamentoRaw) {
    return {
      status: 400,
      body: {
        error: "Parámetros de consulta inválidos.",
        detalles: [{ campo: "", mensaje: "Se requiere 'departamento' o 'dni' (lista separada por comas)." }],
      },
    };
  }

  const dniFilter = dniRaw ? dniRaw.split(",").map((d) => d.trim()).filter(Boolean) : null;

  const { rows: candidatoRows } = await candidatosDb.query<CandidatoRow>(
    dniFilter
      ? `SELECT dni, nombre_completo, cargo, tipo_eleccion, organizacion_politica, departamento, provincia, distrito, estado
           FROM candidatos_erm WHERE estado = 'INSCRITO' AND dni = ANY($1)`
      : `SELECT dni, nombre_completo, cargo, tipo_eleccion, organizacion_politica, departamento, provincia, distrito, estado
           FROM candidatos_erm WHERE estado = 'INSCRITO' AND departamento = $1`,
    [dniFilter ?? departamentoRaw!.toUpperCase()]
  );

  if (candidatoRows.length === 0) {
    return { status: 200, body: { resultados: [] } };
  }

  const dnis = [...new Set(candidatoRows.map((r) => r.dni))];

  const [{ rows: sancionRows }, { rows: vinculoRows }] = await Promise.all([
    db.query<SancionRow>(
      `SELECT dni, ruc, razon_social, estado, resolucion, desde, hasta, 'INHABILITACION'::text AS tipo
         FROM inhabilitaciones WHERE dni = ANY($1)
       UNION ALL
       SELECT dni, ruc, razon_social, estado, resolucion, desde, hasta, 'MULTA'::text AS tipo
         FROM multas WHERE dni = ANY($1)`,
      [dnis]
    ),
    comprasDb.query<VinculoRow>(
      `SELECT numero_documento, ruc, nombre, rol, cargo, fecha_ingreso
         FROM supplier_conformacion
        WHERE numero_documento = ANY($1) AND tipo_documento LIKE '%NACIONAL DE IDENTIDAD%'`,
      [dnis]
    ),
  ]);

  const vinculoRucs = [...new Set(vinculoRows.map((v) => v.ruc))];
  const { rows: empresaSancionRows } = vinculoRucs.length > 0
    ? await db.query<SancionRow>(
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

  return {
    status: 200,
    body: {
      candidatosRevisados: candidatoRows.length,
      resultados,
      limitacion:
        "Un vínculo societario sin sanción en la empresa vinculada no implica irregularidad — es legal que una persona controle o represente a varias empresas. La cobertura de vínculos societarios depende de cuántos RUC tiene ingeridos supplier_conformacion, no es el universo completo de empresas del país.",
    },
  };
}

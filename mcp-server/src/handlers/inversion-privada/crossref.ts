import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool, crossAppUnavailable } from "../proveedores-sancionados/_helpers.js";

interface OxiCrossrefRow extends NeonRow {
  oxi_id: number;
  nombre_proyecto: string;
  codigo_referencia: string | null;
  monto_inversion_referencial: number | string | null;
  funcion: string;
}

interface InvestmentRow extends NeonRow {
  codigo_snip: string;
  nombre: string;
  estado: string;
  monto_viable: number | string | null;
  costo_actualizado: number | string | null;
}

/**
 * Handler para `inversion_privada_oxi_crossref_invierte` — GET /api/crossref/oxi.
 *
 * Cruce OxI (`inversion-privada`) <-> radar-inversiones (Invierte.pe) por
 * `codigo_referencia` contra `codigo_snip`. SQL idéntico a
 * `apps/inversion-privada/api/src/routes/crossref.ts`, salvo que la segunda
 * base (antes `inversionesPool`, un `Pool` de `pg` propio) se resuelve acá vía
 * `crossAppPool("radar-inversiones", env)`.
 */
export async function oxi(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const wantedDepartamento = ((args.departamento as string | undefined)?.toUpperCase().trim()) ?? "LA LIBERTAD";

  const { rows: oxiRows } = await db.query<OxiCrossrefRow>(
    `SELECT oxi_id, nombre_proyecto, codigo_referencia, monto_inversion_referencial, funcion
     FROM oxi_investment_promotions
     WHERE departamento = $1
     ORDER BY oxi_id`,
    [wantedDepartamento],
  );

  const conCodigo = oxiRows.filter((r) => r.codigo_referencia && /^\d+$/.test(r.codigo_referencia.trim()));

  let inversionByCodigo = new Map<string, InvestmentRow>();
  if (conCodigo.length > 0) {
    const inversionesDb = crossAppPool("radar-inversiones", env);
    if (!inversionesDb) return crossAppUnavailable("radar-inversiones");

    const codigos = conCodigo.map((r) => r.codigo_referencia!.trim());
    const { rows: inversionRows } = await inversionesDb.query<InvestmentRow>(
      `SELECT codigo_snip, nombre, estado, monto_viable, costo_actualizado
       FROM investments
       WHERE codigo_snip = ANY($1)`,
      [codigos],
    );
    inversionByCodigo = new Map(inversionRows.map((r) => [r.codigo_snip, r]));
  }

  const resultados = oxiRows.map((r) => {
    const codigo = r.codigo_referencia?.trim() ?? null;
    const inversion = codigo ? inversionByCodigo.get(codigo) : undefined;
    return {
      oxiId: r.oxi_id,
      nombreProyecto: r.nombre_proyecto,
      funcion: r.funcion,
      codigoReferencia: codigo,
      montoInversionReferencialSoles: r.monto_inversion_referencial === null ? null : Number(r.monto_inversion_referencial),
      enInvierte: Boolean(inversion),
      nombreInvierte: inversion?.nombre ?? null,
      estadoInvierte: inversion?.estado ?? null,
      montoViableInvierte:
        inversion && inversion.monto_viable !== null ? Number(inversion.monto_viable) : null,
      costoActualizadoInvierte:
        inversion && inversion.costo_actualizado !== null ? Number(inversion.costo_actualizado) : null,
    };
  });

  return {
    status: 200,
    body: {
      resultados,
      resumen: {
        totalOxi: oxiRows.length,
        conCodigoReferencia: conCodigo.length,
        confirmadosEnInvierte: resultados.filter((r) => r.enInvierte).length,
      },
    },
  };
}

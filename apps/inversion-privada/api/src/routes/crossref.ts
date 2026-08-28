import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { inversionesPool } from "../db/inversiones-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

const CrossrefOxiQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
});

/**
 * Cruce OxI (`inversion-privada`) <-> radar-inversiones (Invierte.pe), por
 * `codigo_referencia` (columna "CODIGO SNIP / INVIERTE.PE / CÓDIGO IDEA" del
 * export OxI) contra `codigo_snip` de `investments`. A diferencia del cruce
 * CUI de `infobras` (donde la columna es inequívocamente un CUI), acá el
 * nombre de columna de la fuente mezcla tres sistemas de código distintos —
 * el match es exacto (sin fuzzy) pero solo confirma lo que efectivamente
 * matchea; una fila sin match no implica que el proyecto no exista en
 * Invierte.pe, solo que su código en OxI no es (o no coincide con) un
 * `codigo_snip` de esa fuente. Mismo patrón de agregación en capa de
 * aplicación que `infobras/src/routes/crossref.ts`.
 */
crossrefRouter.get(
  "/oxi",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CrossrefOxiQuerySchema, req.query, res);
    if (!parsed) return;
    const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";

    const { rows: oxiRows } = await pool.query(
      `SELECT oxi_id, nombre_proyecto, codigo_referencia, monto_inversion_referencial, funcion
       FROM oxi_investment_promotions
       WHERE departamento = $1
       ORDER BY oxi_id`,
      [wantedDepartamento]
    );

    const conCodigo = oxiRows.filter((r) => r.codigo_referencia && /^\d+$/.test(r.codigo_referencia.trim()));

    let inversionByCodigo = new Map<
      string,
      { nombre: string; estado: string; monto_viable: string | null; costo_actualizado: string | null }
    >();
    if (conCodigo.length > 0) {
      const codigos = conCodigo.map((r) => r.codigo_referencia.trim());
      const { rows: inversionRows } = await inversionesPool.query(
        `SELECT codigo_snip, nombre, estado, monto_viable, costo_actualizado
         FROM investments
         WHERE codigo_snip = ANY($1)`,
        [codigos]
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

    res.json({
      resultados,
      resumen: {
        totalOxi: oxiRows.length,
        conCodigoReferencia: conCodigo.length,
        confirmadosEnInvierte: resultados.filter((r) => r.enInvierte).length,
      },
    });
  })
);

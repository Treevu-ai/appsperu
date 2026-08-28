import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { fetchInversionesPublicas, type DependencyStatus, type InversionPublica } from "../lib/api-clients.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1),
});

function buildInversionIndex(inversiones: InversionPublica[]): Map<string, InversionPublica> {
  const index = new Map<string, InversionPublica>();
  for (const inversion of inversiones) {
    index.set(inversion.cui, inversion);
    if (inversion.codigoSnip) index.set(inversion.codigoSnip, inversion);
  }
  return index;
}

crossrefRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.trim().toUpperCase();

    const [appPaResult, oxiResult, inversionesResult] = await Promise.all([
      pool.query<{ tipo_proyecto: string; total: number; monto: string | null }>(
        `SELECT tipo_proyecto, COUNT(*)::int AS total, SUM(monto_inversion_sigv) AS monto
         FROM private_investment_projects
         WHERE $1 = ANY(departamentos)
         GROUP BY tipo_proyecto
         ORDER BY tipo_proyecto`,
        [departamento]
      ),
      pool.query<{ total: number; monto: string | null }>(
        `SELECT COUNT(*)::int AS total, SUM(monto_referencial_soles) AS monto
         FROM oxi_promotion_projects
         WHERE departamento = $1`,
        [departamento]
      ),
      fetchInversionesPublicas(departamento).catch((error) => ({
        inversiones: [] as InversionPublica[],
        dependency: (error as { dependency?: DependencyStatus }).dependency ?? {
          app: "radar-inversiones",
          url: `${process.env.RADAR_INVERSIONES_API_URL ?? "http://localhost:4002"}/api/investments`,
          ok: false,
          error: error instanceof Error ? error.message : "Error desconocido",
        },
      })),
    ]);

    const inversionIndex = buildInversionIndex(inversionesResult.inversiones);

    const { rows: oxiRows } = await pool.query<{
      oxi_id: number;
      codigo_snip: string | null;
      nombre: string;
      entidad: string | null;
      monto_referencial_soles: string | null;
    }>(
      `SELECT oxi_id, codigo_snip, nombre, entidad, monto_referencial_soles
       FROM oxi_promotion_projects
       WHERE departamento = $1 AND codigo_snip IS NOT NULL AND btrim(codigo_snip) <> ''`,
      [departamento]
    );

    const coincidenciasSnip = [];
    for (const oxi of oxiRows) {
      const codigo = oxi.codigo_snip?.trim();
      if (!codigo) continue;
      const inversion = inversionIndex.get(codigo);
      if (!inversion) continue;
      coincidenciasSnip.push({
        matcher: "codigo_snip",
        confidence: "confirmada" as const,
        oxi: {
          oxiId: oxi.oxi_id,
          codigoSnip: codigo,
          nombre: oxi.nombre,
          entidad: oxi.entidad,
          montoReferencialSoles:
            oxi.monto_referencial_soles === null ? null : Number(oxi.monto_referencial_soles),
        },
        inversionPublica: inversion,
      });
    }

    res.json({
      matcher: "departamento + codigo_snip",
      cobertura: coincidenciasSnip.length > 0 ? "PARCIAL" : "SIN_COINCIDENCIAS_SNIP",
      restriccion:
        "La cartera APP/PA de VERTIX no publica CUI; no hay cruce exacto con radar-inversiones. " +
        "Solo los proyectos OxI con código SNIP/Invierte permiten match confirmado por clave.",
      dependencias: [inversionesResult.dependency],
      corte: { departamento },
      contextoTerritorial: {
        carteraAppPa: appPaResult.rows.map((row) => ({
          tipo: row.tipo_proyecto,
          total: row.total,
          montoInversionSigv: row.monto === null ? null : Number(row.monto),
        })),
        oxi: {
          total: oxiResult.rows[0]?.total ?? 0,
          montoReferencialSoles:
            oxiResult.rows[0]?.monto === null ? null : Number(oxiResult.rows[0].monto),
        },
        inversionesPublicas: {
          total: inversionesResult.inversiones.length,
          extraidoEl: inversionesResult.inversiones[0]?.fuente?.extraidoEl ?? null,
        },
      },
      coincidenciasSnip,
    });
  })
);

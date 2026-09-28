import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `proveedores_sancionados_meta_freshness` — GET /api/meta/freshness.
 *
 * Sirve para no presentar una sanción vigente como si reflejara el estado de
 * hoy: fecha de la última ingesta de la fuente TCE/OSCE, días sin actualizar y
 * filas ingeridas.
 */
export async function freshness(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const row = await db.query<{
    ultima_ejecucion: Date | null;
    filas_ingeridas: number | null;
    fuente: string | null;
  }>(
    `SELECT fuente, ultima_ejecucion, filas_ingeridas
     FROM ingestion_log
     WHERE fuente = 'tce_osce'
     ORDER BY ultima_ejecucion DESC
     LIMIT 1`
  );

  const first = row.rows[0];

  return {
    status: 200,
    body: {
      proveedoresSancionados: {
        ultimaIngesta: first?.ultima_ejecucion ? first.ultima_ejecucion.toISOString() : null,
        diasSinActualizar: first?.ultima_ejecucion
          ? Math.floor((Date.now() - new Date(first.ultima_ejecucion).getTime()) / 86_400_000)
          : null,
        fuente: "tce_osce",
        filasIngeridas: first?.filas_ingeridas ?? 0,
      },
    },
  };
}

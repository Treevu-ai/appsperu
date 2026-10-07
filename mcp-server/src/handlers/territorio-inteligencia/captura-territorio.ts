import type { NeonRow } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import { codigoDeDepartamento } from "./_helpers.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface MineroRow extends NeonRow {
  titular: string;
  totalsuperficie: string;
  conteotitulos: string;
}

interface ForestalRow extends NeonRow {
  capa: string;
  sector: string | null;
  totalsuperficie: string;
  conteotitulos: string;
}

/**
 * Handler para `territorio_inteligencia_captura_territorio` — GET /api/captura-territorio.
 * Origen: apps/territorio-inteligencia/api/src/services/captura-territorio.service.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { args, env } = ctx;
  const departamento = args.departamento as string | undefined;
  const tipoCatastro = args.tipoCatastro as "minero" | "forestal" | undefined;
  const limite = args.limiteRucs ? Number(args.limiteRucs) : 10;

  const resultados: Array<{
    identificador: string;
    tipoCatastro: "minero" | "forestal";
    totalSuperficie: number;
    conteoTitulos: number;
    proporcionTerritorial: number;
  }> = [];
  // Si NINGUNA de las fuentes pedidas está configurada, se distingue de "no
  // encontramos concentración" (el resto de handlers de esta app ya usan
  // ENRIQUECIMIENTO_NO_CONFIGURADO para esto, este quedaba devolviendo `[]`
  // sin distinguir los dos casos).
  let algunaFuenteConfigurada = false;

  if (!tipoCatastro || tipoCatastro === "minero") {
    const catastroMineroPool = getPoolForApp(env as NeonEnv, "catastro-minero");
    if (catastroMineroPool) {
      algunaFuenteConfigurada = true;
      const params: unknown[] = [];
      let where = "";
      if (departamento) {
        params.push(`%${departamento}%`);
        where = `WHERE departamento ILIKE $${params.length}`;
      }
      const { rows: [totalRow] } = await catastroMineroPool.query<{ total: string }>(
        `SELECT SUM(hectareas) as total FROM catastro_minero_derechos ${where}`,
        params
      );
      const totalSuperficie = Number(totalRow?.total ?? 0);

      params.push(limite);
      const { rows } = await catastroMineroPool.query<MineroRow>(
        `SELECT titular, SUM(hectareas) as totalsuperficie, COUNT(*) as conteotitulos
         FROM catastro_minero_derechos ${where}
         GROUP BY titular ORDER BY totalsuperficie DESC LIMIT $${params.length}`,
        params
      );
      for (const r of rows) {
        resultados.push({
          identificador: r.titular,
          tipoCatastro: "minero",
          totalSuperficie: Number(r.totalsuperficie),
          conteoTitulos: Number(r.conteotitulos),
          proporcionTerritorial: totalSuperficie > 0 ? (Number(r.totalsuperficie) / totalSuperficie) * 100 : 0,
        });
      }
    }
  }

  if (!tipoCatastro || tipoCatastro === "forestal") {
    const catastroForestalPool = getPoolForApp(env as NeonEnv, "catastro-forestal");
    const codigo = departamento ? codigoDeDepartamento(departamento) : null;
    if (catastroForestalPool) algunaFuenteConfigurada = true;
    if (catastroForestalPool && (!departamento || codigo)) {
      const params: unknown[] = [];
      let where = "";
      if (codigo) {
        params.push(codigo);
        where = `WHERE nom_dep = $${params.length}`;
      }
      const { rows: [totalRow] } = await catastroForestalPool.query<{ total: string }>(
        `SELECT SUM(sup_sig) as total FROM catastro_forestal_titulos ${where}`,
        params
      );
      const totalSuperficie = Number(totalRow?.total ?? 0);

      params.push(limite);
      const { rows } = await catastroForestalPool.query<ForestalRow>(
        `SELECT capa, atributos_extra->>'SECTOR' as sector,
                SUM(sup_sig) as totalsuperficie, COUNT(*) as conteotitulos
         FROM catastro_forestal_titulos ${where}
         GROUP BY capa, atributos_extra->>'SECTOR' ORDER BY totalsuperficie DESC LIMIT $${params.length}`,
        params
      );
      for (const r of rows) {
        resultados.push({
          identificador: r.sector?.trim() || r.capa,
          tipoCatastro: "forestal",
          totalSuperficie: Number(r.totalsuperficie),
          conteoTitulos: Number(r.conteotitulos),
          proporcionTerritorial: totalSuperficie > 0 ? (Number(r.totalsuperficie) / totalSuperficie) * 100 : 0,
        });
      }
    }
  }

  if (!algunaFuenteConfigurada) {
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", resultados: [] } };
  }

  return { status: 200, body: resultados };
}

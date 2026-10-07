import { Router } from "express";
import { catastroMineroPool } from "../db/catastro-minero-pool.js";
import { catastroForestalPool } from "../db/catastro-forestal-pool.js";
import { codigoDeDepartamento } from "../lib/ubigeo.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { CapturaTerritorioQuerySchema, type CapturaTerritorioQuery, type CapturaData } from "../schema/captura-territorio.js";

export const capturaTerritorioRouter = Router();

async function capturaMinero(departamento: string | undefined, limite: number): Promise<CapturaData[]> {
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
  const { rows } = await catastroMineroPool.query<{
    titular: string;
    totalsuperficie: string;
    conteotitulos: string;
  }>(
    `SELECT titular, SUM(hectareas) as totalsuperficie, COUNT(*) as conteotitulos
     FROM catastro_minero_derechos
     ${where}
     GROUP BY titular
     ORDER BY totalsuperficie DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map((r) => ({
    identificador: r.titular,
    tipoCatastro: "minero" as const,
    totalSuperficie: Number(r.totalsuperficie),
    conteoTitulos: Number(r.conteotitulos),
    proporcionTerritorial: totalSuperficie > 0 ? (Number(r.totalsuperficie) / totalSuperficie) * 100 : 0,
  }));
}

/**
 * Sin titular: SERFOR no publica dueño del título forestal. Se agrupa por
 * `capa` (modalidad: concesión, cesión en uso, permiso, etc.) + `SECTOR`
 * (nombre de la unidad/bosque local cuando la fuente lo trae — a menudo
 * vacío) en vez de inventar un identificador de titular que la fuente no
 * tiene.
 */
async function capturaForestal(departamento: string | undefined, limite: number): Promise<CapturaData[]> {
  const params: unknown[] = [];
  let where = "";
  if (departamento) {
    const codigo = codigoDeDepartamento(departamento);
    if (!codigo) return [];
    params.push(codigo);
    where = `WHERE nom_dep = $${params.length}`;
  }

  const { rows: [totalRow] } = await catastroForestalPool.query<{ total: string }>(
    `SELECT SUM(sup_sig) as total FROM catastro_forestal_titulos ${where}`,
    params
  );
  const totalSuperficie = Number(totalRow?.total ?? 0);

  params.push(limite);
  const { rows } = await catastroForestalPool.query<{
    capa: string;
    sector: string | null;
    totalsuperficie: string;
    conteotitulos: string;
  }>(
    `SELECT capa, atributos_extra->>'SECTOR' as sector,
            SUM(sup_sig) as totalsuperficie, COUNT(*) as conteotitulos
     FROM catastro_forestal_titulos
     ${where}
     GROUP BY capa, atributos_extra->>'SECTOR'
     ORDER BY totalsuperficie DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map((r) => ({
    identificador: r.sector?.trim() || r.capa,
    tipoCatastro: "forestal" as const,
    totalSuperficie: Number(r.totalsuperficie),
    conteoTitulos: Number(r.conteotitulos),
    proporcionTerritorial: totalSuperficie > 0 ? (Number(r.totalsuperficie) / totalSuperficie) * 100 : 0,
  }));
}

export async function getCapturaTerritorio(query: CapturaTerritorioQuery): Promise<CapturaData[]> {
  const { departamento, tipoCatastro, limiteRucs } = query;
  const limite = limiteRucs ?? 10;

  if (tipoCatastro === "forestal") return capturaForestal(departamento, limite);
  if (tipoCatastro === "minero") return capturaMinero(departamento, limite);

  const [minero, forestal] = await Promise.all([
    capturaMinero(departamento, limite),
    capturaForestal(departamento, limite),
  ]);
  return [...minero, ...forestal];
}

capturaTerritorioRouter.get("/", asyncHandler(async (req, res) => {
  const query = parseQuery(CapturaTerritorioQuerySchema, req.query, res);
  if (!query) return;
  const results = await getCapturaTerritorio(query);
  res.json(results);
}));

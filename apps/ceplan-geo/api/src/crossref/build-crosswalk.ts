import { pool } from "../db/pool.js";
import { fetchInfobrasObras } from "../lib/api-clients.js";
import { lookupTerritoryByNames } from "./territory-lookup.js";
import { normalizeTerritoryToken } from "../ingest/normalize.js";
import { pathToFileURL } from "node:url";

export type BuildTerritoryCrosswalkSummary = {
  departamento: string;
  triples: number;
  confirmadas: number;
  candidatas: number;
  sinMatch: number;
};

export async function buildTerritoryCrosswalk(departamento: string): Promise<BuildTerritoryCrosswalkSummary> {
  const wantedDepartamento = departamento.toUpperCase().trim();
  const { obras } = await fetchInfobrasObras(wantedDepartamento);

  const seen = new Set<string>();
  const triples: Array<{ departamento: string; provincia: string | null; distrito: string | null }> = [];

  for (const obra of obras) {
    const dept = normalizeTerritoryToken(obra.departamento);
    const prov = normalizeTerritoryToken(obra.provincia);
    const dist = normalizeTerritoryToken(obra.distrito);
    if (!dept) continue;
    const key = `${dept}|${prov ?? ""}|${dist ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    triples.push({ departamento: dept, provincia: prov, distrito: dist });
  }

  let confirmadas = 0;
  let candidatas = 0;
  let sinMatch = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const triple of triples) {
      const { territory, matchStatus } = await lookupTerritoryByNames(
        triple.departamento,
        triple.provincia,
        triple.distrito
      );

      if (matchStatus === "confirmada") confirmadas += 1;
      else if (matchStatus === "candidata") candidatas += 1;
      else sinMatch += 1;

      await client.query(
        `INSERT INTO territory_name_crosswalk (departamento, provincia, distrito, ubigeo, match_status, source)
         VALUES ($1, $2, $3, $4, $5, 'infobras')
         ON CONFLICT (departamento, provincia, distrito, source) DO UPDATE
           SET ubigeo = EXCLUDED.ubigeo,
               match_status = EXCLUDED.match_status,
               updated_at = now()`,
        [triple.departamento, triple.provincia, triple.distrito, territory?.ubigeo ?? null, matchStatus]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    departamento: wantedDepartamento,
    triples: triples.length,
    confirmadas,
    candidatas,
    sinMatch,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamento = process.env.CEPLAN_GEO_DEPARTAMENTO ?? "LA LIBERTAD";
  buildTerritoryCrosswalk(departamento)
    .then((summary) => {
      console.log(
        `${summary.departamento}: ${summary.triples} tríadas, ${summary.confirmadas} confirmadas, ${summary.candidatas} candidatas, ${summary.sinMatch} sin match`
      );
      return pool.end();
    })
    .catch((err) => {
      console.error("Error en crossref:build:", err);
      process.exit(1);
    });
}

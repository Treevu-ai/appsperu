import { pool } from "../db/pool.js";
import { fetchInfobrasObras, fetchPoderJudicialTerritorios } from "../lib/api-clients.js";
import { lookupTerritoryByNames, lookupTerritoryByProvinciaDistrito } from "./territory-lookup.js";
import { normalizeTerritoryToken } from "../ingest/normalize.js";
import { pathToFileURL } from "node:url";

/** `territory_name_crosswalk.departamento` es NOT NULL — fuentes sin
 * departamento propio (ver `buildTerritoryCrosswalkPoderJudicial`) usan
 * este valor centinela cuando no hubo match, en vez de adivinar uno. Nunca
 * aparece en `territories` (los departamentos reales son literales del
 * catálogo UBIGEO), así que no colisiona con un departamento real. */
export const SIN_MATCH_DEPARTAMENTO = "SIN_MATCH";

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

export type BuildPoderJudicialCrosswalkSummary = {
  triples: number;
  confirmadas: number;
  candidatas: number;
  sinMatch: number;
  /** Tríadas de `territorios` sin provincia NI distrito -- no se pudieron
   * clasificar ni insertar. `confirmadas + candidatas + sinMatch + skipped`
   * siempre debe sumar `triples` (hallazgo de CodeRabbit en PR #172: antes
   * `triples` no dejaba rastro de estas filas, así que el resumen podía no
   * cuadrar sin explicación). */
  skipped: number;
};

/** Clave fija para `pg_advisory_xact_lock` -- serializa corridas concurrentes
 * de este builder (mismo hallazgo de Copilot en PR #172: a diferencia de
 * `buildTerritoryCrosswalk`, que upsertea atómico vía `ON CONFLICT`, este
 * builder hace DELETE+INSERT por fila -- ver el comentario de esa parte más
 * abajo sobre por qué no puede usar ON CONFLICT -- así que dos corridas en
 * paralelo podrían pisarse. El lock se libera solo al hacer COMMIT/ROLLBACK
 * de la transacción, así que basta un `SELECT` al inicio de la misma. */
const ADVISORY_LOCK_KEY = "hashtext('territory_name_crosswalk:poder-judicial:build')";

/**
 * Igual que `buildTerritoryCrosswalk`, pero para `poder-judicial`: esa fuente
 * no trae departamento (ver `SIN_MATCH_DEPARTAMENTO`), así que el match se
 * hace solo por provincia+distrito a nivel nacional
 * (`lookupTerritoryByProvinciaDistrito`) y NO recibe un `departamento` como
 * parámetro — trae sus propias triadas completas desde
 * `GET /api/procesos-judiciales/territorios`, no hay forma de acotarlas de
 * antemano como sí se puede con INFOBRAS.
 */
export async function buildTerritoryCrosswalkPoderJudicial(): Promise<BuildPoderJudicialCrosswalkSummary> {
  const { territorios } = await fetchPoderJudicialTerritorios();

  let confirmadas = 0;
  let candidatas = 0;
  let sinMatch = 0;
  let skipped = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`);
    for (const { provincia, distrito } of territorios) {
      const prov = normalizeTerritoryToken(provincia);
      const dist = normalizeTerritoryToken(distrito);
      if (!prov && !dist) {
        skipped += 1;
        continue;
      }

      const { territory, matchStatus } = await lookupTerritoryByProvinciaDistrito(prov, dist);

      if (matchStatus === "confirmada") confirmadas += 1;
      else if (matchStatus === "candidata") candidatas += 1;
      else sinMatch += 1;

      // No se puede usar `INSERT ... ON CONFLICT (departamento, provincia,
      // distrito, source)` acá: para esta fuente `departamento` es un
      // RESULTADO del match (viene de `territory?.departamento`), no un dato
      // de entrada estable como en `buildTerritoryCrosswalk` (INFOBRAS, donde
      // departamento es el filtro con el que se pidieron las obras). Si una
      // corrida anterior quedó `sin_match` (departamento=SIN_MATCH_DEPARTAMENTO)
      // y esta corrida sí matchea (departamento real), el conflicto no
      // calzaría contra esa fila vieja — insertaría una fila nueva y dejaría
      // la `SIN_MATCH` huérfana (bug real encontrado en vivo, 2026-09-20, al
      // agregar el alias NAZCA→NASCA). La identidad real de una tríada de
      // esta fuente es (provincia, distrito, source) — se borra por esa
      // clave y se reinserta, en vez de depender del `departamento` que
      // recién se conoce en esta misma corrida.
      await client.query(
        `DELETE FROM territory_name_crosswalk
         WHERE provincia IS NOT DISTINCT FROM $1 AND distrito IS NOT DISTINCT FROM $2 AND source = 'poder-judicial'`,
        [prov, dist]
      );
      await client.query(
        `INSERT INTO territory_name_crosswalk (departamento, provincia, distrito, ubigeo, match_status, source)
         VALUES ($1, $2, $3, $4, $5, 'poder-judicial')`,
        [territory?.departamento ?? SIN_MATCH_DEPARTAMENTO, prov, dist, territory?.ubigeo ?? null, matchStatus]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { triples: territorios.length, confirmadas, candidatas, sinMatch, skipped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = process.env.CROSSWALK_SOURCE ?? "infobras";

  const run =
    source === "poder-judicial"
      ? buildTerritoryCrosswalkPoderJudicial().then((summary) => {
          console.log(
            `poder-judicial: ${summary.triples} tríadas, ${summary.confirmadas} confirmadas, ${summary.candidatas} candidatas, ${summary.sinMatch} sin match, ${summary.skipped} sin provincia/distrito (saltadas)`
          );
        })
      : buildTerritoryCrosswalk(process.env.CEPLAN_GEO_DEPARTAMENTO ?? "LA LIBERTAD").then((summary) => {
          console.log(
            `${summary.departamento}: ${summary.triples} tríadas, ${summary.confirmadas} confirmadas, ${summary.candidatas} candidatas, ${summary.sinMatch} sin match`
          );
        });

  run
    .then(() => pool.end())
    .catch((err) => {
      console.error("Error en crossref:build:", err);
      process.exit(1);
    });
}

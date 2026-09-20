import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { parseGetNombreConsulta, type AbpResult } from "./padron-ppa-normalize.js";

/**
 * Ingesta del Padrón de Productores Agrarios (PPA) de MIDAGRI —
 * consultapadron.midagri.gob.pe, API en gateway.midagri.gob.pe/sisppa
 * (ABP Framework). Confirmado en vivo el 2026-09-20: GET plano, sin
 * captcha, sin sesión — accesible por fetch directo desde este entorno,
 * igual que aduanet.gob.pe. Ver docs/data-contracts/midagri-padron-ppa.md.
 *
 * `codDocumento=6` es RUC (confirmado en vivo). Solo se consulta por RUC
 * en este conector (el seed de cooperativas es RUC, no DNI).
 */

const BASE_URL = "https://gateway.midagri.gob.pe/sisppa/api/services/app/Consulta/GetNombreConsulta";
const COD_DOCUMENTO_RUC = "6";
const DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function consultarRuc(ruc: string): Promise<AbpResult> {
  const params = new URLSearchParams({ codDocumento: COD_DOCUMENTO_RUC, Documento: ruc });
  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`MIDAGRI PPA respondió ${res.status} para RUC ${ruc}`);
  }
  return (await res.json()) as AbpResult;
}

async function upsert(ruc: string, registrado: boolean, nombrePpa: string | null, fechaConsulta: string): Promise<void> {
  await pool.query(
    `INSERT INTO ruc_padron_ppa (ruc, registrado, nombre_ppa, fecha_consulta)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (ruc) DO UPDATE SET
       registrado = EXCLUDED.registrado,
       nombre_ppa = EXCLUDED.nombre_ppa,
       fecha_consulta = EXCLUDED.fecha_consulta`,
    [ruc, registrado, nombrePpa, fechaConsulta]
  );
}

export interface IngestSummary {
  rucsConsultados: number;
  registrados: number;
  errores: { ruc: string; error: string }[];
}

export async function ingestPadronPpa(rucs: string[]): Promise<IngestSummary> {
  const fechaConsulta = new Date().toISOString();
  const summary: IngestSummary = { rucsConsultados: 0, registrados: 0, errores: [] };

  for (const ruc of rucs) {
    summary.rucsConsultados++;
    try {
      const response = await consultarRuc(ruc);
      const { registrado, nombrePpa } = parseGetNombreConsulta(response);
      await upsert(ruc, registrado, nombrePpa, fechaConsulta);
      if (registrado) summary.registrados++;
    } catch (err) {
      summary.errores.push({ ruc, error: err instanceof Error ? err.message : String(err) });
    }
    await sleep(DELAY_MS);
  }

  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  import("./cooperativas-ruc-seed.json", { with: { type: "json" } })
    .then(async (seedMod) => {
      const seed = seedMod.default as { ruc: string }[];
      console.log(`Consultando Padrón de Productores Agrarios para ${seed.length} RUC...`);
      const summary = await ingestPadronPpa(seed.map((s) => s.ruc));
      console.log("Ingesta del Padrón PPA completada:", summary);
      await pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}

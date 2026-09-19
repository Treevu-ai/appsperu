import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { parseExportacionesFobHtml, type ExportacionFobRow } from "./exportaciones-fob-normalize.js";

/**
 * Ingesta de exportaciones FOB por RUC desde "Consulta por Importador/
 * Exportador" de Aduanas-SUNAT (aduanet.gob.pe/cl-ad-itconsultadwh/
 * ieITS01Alias, régimen 40 = exportación definitiva). A diferencia de las
 * fuentes *.sunat.gob.pe (ficha_ruc, ruc_consulta_masiva), este dominio NO
 * está bloqueado para fetch directo desde este entorno — confirmado en vivo
 * el 2026-09-19 con curl. Se ingiere automatizado, sin navegador.
 *
 * El formulario usa un código de año no obvio: el valor real que hay que
 * mandar en `CG_Ano` es `añoReal - 1992` (confirmado en vivo probando varios
 * valores contra resultados conocidos). Ver
 * docs/data-contracts/aduanet-exportaciones-fob.md.
 */

const BASE_URL = "http://www.aduanet.gob.pe/cl-ad-itconsultadwh/ieITS01Alias";
const ANIO_OFFSET = 1992;
const REGIMEN_EXPORTACION = "40";
const DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(ruc: string, anio: number): string {
  const params = new URLSearchParams({
    accion: "buscarListadoImpoExpo",
    CG_consulta: "1",
    indOCE: "false",
    vig001278: "F",
    strMenu: "-",
    CG_tipo: "4",
    CG_Codigo: ruc,
    CG_DNombre: "",
    CG_Aduana: "999",
    CG_Ano: String(anio - ANIO_OFFSET),
    CG_Mes: "00",
    CG_regimen: REGIMEN_EXPORTACION,
  });
  return `${BASE_URL}?${params.toString()}`;
}

async function fetchExportacionesFob(ruc: string, anio: number): Promise<ExportacionFobRow[]> {
  const res = await fetch(buildUrl(ruc, anio));
  if (!res.ok) {
    throw new Error(`aduanet respondió ${res.status} para RUC ${ruc} año ${anio}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const html = buf.toString("latin1");
  return parseExportacionesFobHtml(html);
}

async function upsertRows(rows: ExportacionFobRow[], fechaConsulta: string): Promise<void> {
  if (rows.length === 0) return;

  const columns = [
    "ruc",
    "anio",
    "mes",
    "aduana_codigo",
    "aduana_nombre",
    "agente_codigo",
    "agente_nombre",
    "pais_codigo",
    "pais_nombre",
    "fob_usd",
    "fecha_consulta",
  ];

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * columns.length;
    tuples.push(`(${columns.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.ruc,
      row.anio,
      row.mes,
      row.aduanaCodigo,
      row.aduanaNombre,
      row.agenteCodigo,
      row.agenteNombre,
      row.paisCodigo,
      row.paisNombre,
      row.fobUsd,
      fechaConsulta
    );
  });

  await pool.query(
    `INSERT INTO ruc_exportaciones_fob (${columns.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (ruc, anio, mes, aduana_codigo, agente_codigo, pais_codigo)
     DO UPDATE SET
       aduana_nombre = EXCLUDED.aduana_nombre,
       agente_nombre = EXCLUDED.agente_nombre,
       pais_nombre = EXCLUDED.pais_nombre,
       fob_usd = EXCLUDED.fob_usd,
       fecha_consulta = EXCLUDED.fecha_consulta`,
    values
  );
}

export interface IngestSummary {
  rucsConsultados: number;
  rucsConDatos: number;
  filasInsertadas: number;
  errores: { ruc: string; anio: number; error: string }[];
}

export async function ingestExportacionesFob(rucs: string[], anios: number[]): Promise<IngestSummary> {
  const fechaConsulta = new Date().toISOString();
  const summary: IngestSummary = { rucsConsultados: 0, rucsConDatos: 0, filasInsertadas: 0, errores: [] };

  for (const ruc of rucs) {
    let rucTuvoDatos = false;
    for (const anio of anios) {
      summary.rucsConsultados++;
      try {
        const rows = await fetchExportacionesFob(ruc, anio);
        if (rows.length > 0) {
          rucTuvoDatos = true;
          await upsertRows(rows, fechaConsulta);
          summary.filasInsertadas += rows.length;
        }
      } catch (err) {
        summary.errores.push({ ruc, anio, error: err instanceof Error ? err.message : String(err) });
      }
      await sleep(DELAY_MS);
    }
    if (rucTuvoDatos) summary.rucsConDatos++;
  }

  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const anios = (process.argv[2] ?? "2025,2026").split(",").map((s) => Number(s.trim()));

  import("./cooperativas-ruc-seed.json", { with: { type: "json" } })
    .then(async (seedMod) => {
      const seed = seedMod.default as { ruc: string }[];
      console.log(`Consultando exportaciones FOB para ${seed.length} RUC, años ${anios.join(", ")}...`);
      const summary = await ingestExportacionesFob(
        seed.map((s) => s.ruc),
        anios
      );
      console.log("Ingesta de exportaciones FOB completada:", summary);
      await pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";

const BASE_URL = "https://www.fonafe.gob.pe/empresasdelacorporacion";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Lista depurada de las 34 empresas activas bajo el ámbito de FONAFE
 * (confirmada contra /empresasdelacorporacion, por sector, 2026-09-30).
 * El scrape crudo de la página también trae `banmatsac`, `banvip`, `enace`,
 * `essalud` mezclados en los mismos enlaces -- excluidos a propósito: BANMAT
 * y ENACE llevan años disueltas/en liquidación, ESSALUD no es una empresa
 * FONAFE (organismo público aparte, quedó capturado por error de regex).
 */
const EMPRESAS: Array<{ slug: string; sector: string }> = [
  { slug: "adinelsasa", sector: "Distribución Eléctrica" },
  { slug: "electroorientesa", sector: "Distribución Eléctrica" },
  { slug: "electropunosaa", sector: "Distribución Eléctrica" },
  { slug: "electrosurestesaa", sector: "Distribución Eléctrica" },
  { slug: "electroucayalisa", sector: "Distribución Eléctrica" },
  { slug: "electrocentrosa", sector: "Distribución Eléctrica" },
  { slug: "electronoroestesa", sector: "Distribución Eléctrica" },
  { slug: "electronortesa", sector: "Distribución Eléctrica" },
  { slug: "electrosursa", sector: "Distribución Eléctrica" },
  { slug: "hidrandinasa", sector: "Distribución Eléctrica" },
  { slug: "sealsa", sector: "Distribución Eléctrica" },
  { slug: "egasasa", sector: "Generación Eléctrica" },
  { slug: "egemsasa", sector: "Generación Eléctrica" },
  { slug: "egesursa", sector: "Generación Eléctrica" },
  { slug: "electroperusa", sector: "Generación Eléctrica" },
  { slug: "sangabansa", sector: "Generación Eléctrica" },
  { slug: "sedapalsa", sector: "Saneamiento" },
  { slug: "corpacsa", sector: "Transportes y Comunicaciones" },
  { slug: "editoraperusa", sector: "Transportes y Comunicaciones" },
  { slug: "enapusa", sector: "Transportes y Comunicaciones" },
  { slug: "serpostsa", sector: "Transportes y Comunicaciones" },
  { slug: "agrobancosa", sector: "Finanzas" },
  { slug: "bancodelanacion", sector: "Finanzas" },
  { slug: "cofidesa", sector: "Finanzas" },
  { slug: "fondomiviviendasa", sector: "Finanzas" },
  { slug: "famesac", sector: "Defensa" },
  { slug: "semanperusac", sector: "Defensa" },
  { slug: "simaiquitossrl", sector: "Defensa" },
  { slug: "simaperusa", sector: "Defensa" },
  { slug: "activosminerossac", sector: "Hidrocarburos" },
  { slug: "perupetrosa", sector: "Hidrocarburos" },
  { slug: "enacosa", sector: "Servicios y Producción" },
  { slug: "esvicsacsac", sector: "Servicios y Producción" },
  { slug: "silsasa", sector: "Servicios y Producción" },
];

const DATASET = "fonafe_presupuesto_empresarial";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`FONAFE devolvió ${res.status} al pedir ${url}`);
  return res.text();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

function extractCodigo(html: string): string | null {
  const m = html.match(/dataempresarial\/(\d+)\/\d+/);
  return m ? m[1] : null;
}

function extractField(html: string, label: string): string | null {
  const re = new RegExp(`<b>${label}<\\/b>:[\\s\\S]*?<div class="col">([\\s\\S]*?)<\\/div>`, "i");
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

interface TableRow {
  rubro: string;
  presupuestadoAnual: number | null;
  presupuestoUltimoMes: number | null;
  ejecucionUltimoMes: number | null;
}

function parseNumber(s: string): number | null {
  const clean = s.replace(/,/g, "").trim();
  if (clean === "" || clean.toLowerCase() === "nan") return null;
  const n = Number(clean);
  return Number.isNaN(n) ? null : n;
}

function extractTableRows(html: string): TableRow[] {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return [];
  const rowMatches = [...tbodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
  const rows: TableRow[] = [];
  for (const rm of rowMatches) {
    const cellMatches = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      decodeEntities(c[1].replace(/<[^>]+>/g, ""))
    );
    if (cellMatches.length < 4) continue;
    rows.push({
      rubro: cellMatches[0],
      presupuestadoAnual: parseNumber(cellMatches[1]),
      presupuestoUltimoMes: parseNumber(cellMatches[2]),
      ejecucionUltimoMes: parseNumber(cellMatches[3]),
    });
  }
  return rows;
}

async function upsertEmpresa(client: PoolClient, slug: string, sector: string, codigo: string, razonSocial: string | null): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO empresas_fonafe (slug, codigo_interno, razon_social, sector)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE SET codigo_interno = EXCLUDED.codigo_interno, razon_social = EXCLUDED.razon_social
     RETURNING id`,
    [slug, codigo, razonSocial, sector]
  );
  return rows[0].id;
}

async function ingestFonafe(): Promise<{ batchId: number; empresasProcesadas: number; filasInsertadas: number; empresasConError: string[] }> {
  const client = await pool.connect();
  const errores: string[] = [];
  let filasInsertadas = 0;
  let empresasProcesadas = 0;

  // El checksum debe describir el contenido realmente descargado, no un valor que cambia en
  // cada corrida sin importar si la fuente cambió (hallazgo real de CodeRabbit en PR #233: antes
  // usaba `Date.now()`). Como este conector descarga 34 páginas una por una (no un solo archivo),
  // se acumula cada `reportHtml` en orden de slug y se recalcula el checksum real al final.
  const reportesDescargados: string[] = [];

  try {
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_fonafe_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, BASE_URL, checksumOf(DATASET), EMPRESAS.length]
    );
    const batchId = batchRows[0].id;

    for (const { slug, sector } of EMPRESAS) {
      try {
        const detailHtml = await fetchHtml(`${BASE_URL}/${slug}`);
        const codigo = extractCodigo(detailHtml);
        if (!codigo) {
          errores.push(`${slug}: no se encontró código interno en la página de detalle`);
          continue;
        }

        const reportHtml = await fetchHtml(`${BASE_URL}/dataempresarial/${codigo}/06`);
        reportesDescargados.push(`${slug}:${reportHtml}`);
        const razonSocial = extractField(reportHtml, "RAZÓN SOCIAL");
        const anioStr = extractField(reportHtml, "AÑO DE EJECUCIÓN");
        const ultimoMes = extractField(reportHtml, "ÚLTIMO MES INFORMADO");
        const tableRows = extractTableRows(reportHtml);

        const empresaId = await upsertEmpresa(client, slug, sector, codigo, razonSocial);
        empresasProcesadas++;

        await client.query("BEGIN");
        for (const row of tableRows) {
          await client.query(
            `INSERT INTO presupuesto_empresarial
               (empresa_id, anio_ejecucion, ultimo_mes_informado, rubro,
                presupuestado_anual, presupuesto_ultimo_mes, ejecucion_ultimo_mes, source_batch_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              empresaId, anioStr ? Number(anioStr) : null, ultimoMes, row.rubro,
              row.presupuestadoAnual, row.presupuestoUltimoMes, row.ejecucionUltimoMes, batchId,
            ]
          );
          filasInsertadas++;
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        errores.push(`${slug}: ${String((err as Error).message).slice(0, 120)}`);
      }
    }

    await client.query(`UPDATE raw_fonafe_batches SET checksum = $1 WHERE id = $2`, [
      checksumOf(reportesDescargados.join("\n")),
      batchId,
    ]);

    return { batchId, empresasProcesadas, filasInsertadas, empresasConError: errores };
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestFonafe()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

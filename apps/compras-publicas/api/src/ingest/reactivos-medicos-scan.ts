import { pathToFileURL } from "node:url";
import { fetchWithTimeout } from "@appsperu/http-client";
import { pool } from "../db/pool.js";
import type { OcdsParty } from "./normalize.js";
import type { OcdsAward, OcdsRecord } from "./normalize-awards.js";

const API_BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1";

/**
 * Recorte temático "mercado de reactivos médicos": no reingesta releases
 * completos (eso ya lo hace `oece-connector.ts`/`oece-records-connector.ts`
 * para todo rubro) -- pagina `/releases` filtrando `mainProcurementCategory
 * =goods` en la ventana pedida, se queda solo con lo que menciona "reactivo"
 * en título/descripción/ítems, y para cada match consulta
 * `/records?ocid=...` (confirmado en vivo que ese filtro funciona) para
 * traer el adjudicatario si ya existe.
 */
export function isReactivoText(text: string | null | undefined): boolean {
  if (!text) return false;
  return /REACTIV/i.test(text);
}

export interface OcdsItem {
  description?: string;
  classification?: { description?: string };
}

export interface OcdsReleaseWithItems {
  ocid?: string;
  buyer?: { id?: string; name?: string };
  parties?: OcdsParty[];
  tender?: {
    title?: string;
    description?: string;
    datePublished?: string;
    value?: { amount?: number | null; currency?: string };
    items?: OcdsItem[];
  };
}

export interface ReleasesPageResponse {
  releases: OcdsReleaseWithItems[];
}

export interface RecordsByOcidResponse {
  records: OcdsRecord[];
}

export function releasesPageUrl(page: number, startDate: string, endDate: string): string {
  const qs = new URLSearchParams({
    page: String(page),
    order: "desc",
    mainProcurementCategory: "goods",
    startDate,
    endDate,
  });
  return `${API_BASE_URL}/releases?${qs.toString()}`;
}

export function recordByOcidUrl(ocid: string): string {
  return `${API_BASE_URL}/records?ocid=${encodeURIComponent(ocid)}`;
}

export interface ReactivoMatch {
  ocid: string;
  buyerId: string | null;
  buyerName: string | null;
  departamento: string | null;
  titulo: string | null;
  itemDesc: string;
  valorTender: number | null;
  valorMoneda: string | null;
  fechaPublicacion: string | null;
}

/** Trata `""` como ausente, no solo `null`/`undefined` -- a diferencia de `??`,
 * que solo cae al siguiente valor cuando el operando es `null`/`undefined`.
 * Sin esto, dos ítems distintos de un mismo release con `description: ""`
 * pero cada uno matcheando "reactivo" solo por `classification.description`
 * producirían el mismo `itemDesc = ""` y colisionarían en el upsert por
 * `(ocid, item_desc)`, perdiendo uno de los dos hallazgos en silencio. */
function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    if (v && v.trim() !== "") return v;
  }
  return "";
}

function departamentoFromRelease(release: OcdsReleaseWithItems): string | null {
  const buyerId = release.buyer?.id;
  if (!buyerId || !release.parties) return null;
  const party = release.parties.find(
    (p) => p.id === buyerId && (p.roles?.includes("buyer") || p.roles?.includes("procuringEntity"))
  );
  return party?.address?.department?.trim() || null;
}

/**
 * Una fila por (release, ítem que menciona "reactivo"). Si ningún ítem
 * individual matchea pero el título/descripción del proceso sí, se emite una
 * fila con `itemDesc` = título (proceso relevante aunque no venga desglosado
 * por ítem en `/releases`).
 */
export function findReactivoMatches(releases: OcdsReleaseWithItems[]): ReactivoMatch[] {
  const matches: ReactivoMatch[] = [];
  for (const release of releases) {
    if (!release.ocid) continue;
    const tender = release.tender ?? {};
    const base = {
      ocid: release.ocid,
      buyerId: release.buyer?.id ?? null,
      buyerName: release.buyer?.name ?? null,
      departamento: departamentoFromRelease(release),
      titulo: tender.title ?? null,
      valorTender: typeof tender.value?.amount === "number" ? tender.value.amount : null,
      valorMoneda: tender.value?.currency ?? null,
      fechaPublicacion: tender.datePublished ?? null,
    };

    const itemHits = (tender.items ?? []).filter(
      (it) => isReactivoText(it.description) || isReactivoText(it.classification?.description)
    );
    if (itemHits.length > 0) {
      for (const item of itemHits) {
        matches.push({ ...base, itemDesc: firstNonEmpty(item.description, item.classification?.description, tender.title) });
      }
      continue;
    }

    if (isReactivoText(tender.title) || isReactivoText(tender.description)) {
      matches.push({ ...base, itemDesc: firstNonEmpty(tender.title, tender.description) });
    }
  }
  return matches;
}

export interface ReactivoAward {
  supplierId: string | null;
  supplierName: string | null;
  valor: number | null;
  moneda: string | null;
  fecha: string | null;
}

/** Primer award con proveedor válido del record (si existe). Un ocid puede
 * tener varios awards (por lote/ítem) -- se toma el primero como señal de
 * "ya tiene adjudicatario", no se intenta reconstruir todos los lotes aquí. */
export function firstAwardOf(record: OcdsRecord | undefined): ReactivoAward | null {
  const awards: OcdsAward[] = record?.compiledRelease?.awards ?? [];
  for (const award of awards) {
    const supplier = award.suppliers?.[0];
    if (supplier?.id && supplier.name) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        valor: typeof award.value?.amount === "number" ? award.value.amount : null,
        moneda: award.value?.currency ?? null,
        fecha: award.date ?? null,
      };
    }
  }
  return null;
}

async function fetchReleasesPage(page: number, startDate: string, endDate: string): Promise<ReleasesPageResponse> {
  const res = await fetchWithTimeout(releasesPageUrl(page, startDate, endDate));
  if (res.status === 404) return { releases: [] };
  if (!res.ok) throw new Error(`OECE devolvió ${res.status} para la página ${page} de /releases`);
  return (await res.json()) as ReleasesPageResponse;
}

async function fetchRecordByOcid(ocid: string): Promise<OcdsRecord | undefined> {
  const res = await fetchWithTimeout(recordByOcidUrl(ocid));
  if (!res.ok) throw new Error(`OECE devolvió ${res.status} para /records?ocid=${ocid}`);
  const body = (await res.json()) as RecordsByOcidResponse;
  return body.records?.[0];
}

export interface ReactivosMedicosScanSummary {
  startDate: string;
  endDate: string;
  pagesScanned: number;
  releasesScanned: number;
  matches: number;
  matchesConAward: number;
  filasUpsertadas: number;
}

export async function scanReactivosMedicos(options: {
  startDate: string;
  endDate: string;
  maxPages?: number;
}): Promise<ReactivosMedicosScanSummary> {
  const { startDate, endDate, maxPages = 40 } = options;

  let releasesScanned = 0;
  let pagesScanned = 0;
  const allMatches: ReactivoMatch[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const body = await fetchReleasesPage(page, startDate, endDate);
    if (!body.releases || body.releases.length === 0) break;
    pagesScanned++;
    releasesScanned += body.releases.length;
    allMatches.push(...findReactivoMatches(body.releases));
  }

  const client = await pool.connect();
  let filasUpsertadas = 0;
  let matchesConAward = 0;
  try {
    for (const match of allMatches) {
      const record = await fetchRecordByOcid(match.ocid);
      const award = firstAwardOf(record);
      if (award) matchesConAward++;

      await client.query(
        `INSERT INTO reactivos_medicos_hallazgos
           (ocid, buyer_id, buyer_name, departamento, titulo, item_desc, valor_tender, valor_moneda,
            fecha_publicacion, award_supplier_id, award_supplier_name, award_valor, award_moneda, award_fecha)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (ocid, item_desc) DO UPDATE SET
           buyer_id = EXCLUDED.buyer_id,
           buyer_name = EXCLUDED.buyer_name,
           departamento = EXCLUDED.departamento,
           titulo = EXCLUDED.titulo,
           valor_tender = EXCLUDED.valor_tender,
           valor_moneda = EXCLUDED.valor_moneda,
           fecha_publicacion = EXCLUDED.fecha_publicacion,
           award_supplier_id = EXCLUDED.award_supplier_id,
           award_supplier_name = EXCLUDED.award_supplier_name,
           award_valor = EXCLUDED.award_valor,
           award_moneda = EXCLUDED.award_moneda,
           award_fecha = EXCLUDED.award_fecha,
           detectado_at = now()`,
        [
          match.ocid,
          match.buyerId,
          match.buyerName,
          match.departamento,
          match.titulo,
          match.itemDesc,
          match.valorTender,
          match.valorMoneda,
          match.fechaPublicacion,
          award?.supplierId ?? null,
          award?.supplierName ?? null,
          award?.valor ?? null,
          award?.moneda ?? null,
          award?.fecha ?? null,
        ]
      );
      filasUpsertadas++;
    }
  } finally {
    client.release();
  }

  return {
    startDate,
    endDate,
    pagesScanned,
    releasesScanned,
    matches: allMatches.length,
    matchesConAward,
    filasUpsertadas,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  const startDate = value("--start-date");
  const endDate = value("--end-date");
  const maxPagesArg = value("--max-pages");
  if (!startDate || !endDate) {
    throw new Error("Usa --start-date YYYY-MM-DD y --end-date YYYY-MM-DD; una corrida sin ventana no está permitida.");
  }
  scanReactivosMedicos({ startDate, endDate, maxPages: maxPagesArg ? Number(maxPagesArg) : undefined })
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error("Scan de reactivos médicos falló:", error);
      process.exitCode = 1;
    });
}

import { findBuyerDepartamento, type OcdsRecord } from "./normalize-awards.js";

/**
 * Estados de `tender.items[].statusDetails` confirmados en vivo (2026-09-06,
 * muestra de 60 records / 4 meses) como terminales y sin adjudicación.
 * Deliberadamente NO incluye `RETROTRAIDO_POR_RESOLUCION` ni
 * `PENDIENTE_DE_REGISTRO_DE_EFECTO` — sin evidencia de qué significan
 * operacionalmente, no se fuerza su clasificación. `CONVOCADO` tampoco se
 * incluye: es un proceso todavía en trámite, no concluido.
 */
const UNSUCCESSFUL_STATUS_DETAILS = new Set(["DESIERTO", "NULO"]);

export interface CanonicalUnsuccessfulTenderRow {
  ocid: string;
  tenderId: string | null;
  itemId: string;
  statusDetails: "DESIERTO" | "NULO";
  itemDescription: string | null;
  buyerId: string | null;
  buyerName: string | null;
  departamento: string | null;
  fecha: string | null;
}

export interface RejectedUnsuccessfulTender {
  raw: unknown;
  reason: string;
}

export interface NormalizeUnsuccessfulTendersResult {
  rows: CanonicalUnsuccessfulTenderRow[];
  rejected: RejectedUnsuccessfulTender[];
}

/**
 * Extrae ítems de contratación declarados DESIERTO o NULO — procesos de
 * dinero público que terminaron sin adjudicar a nadie. Un record con
 * `awards` no aporta aquí: si ya tiene adjudicación, sus ítems no son
 * "sin adjudicar" en el sentido de este modelo, aunque técnicamente
 * `statusDetails` sea por-ítem (un proceso con varios ítems puede tener
 * unos adjudicados y otros desiertos — ese caso mixto sí se captura, porque
 * se evalúa por ítem, no por record completo).
 */
export function normalizeUnsuccessfulTenders(records: OcdsRecord[]): NormalizeUnsuccessfulTendersResult {
  const rows: CanonicalUnsuccessfulTenderRow[] = [];
  const rejected: RejectedUnsuccessfulTender[] = [];
  const seenKey = new Set<string>();

  for (const record of records) {
    const compiled = record.compiledRelease;
    const items = (compiled?.tender as { items?: Array<{ id?: string; description?: string; statusDetails?: string }> } | undefined)?.items;
    if (!items || items.length === 0) continue;

    const ocid = record.ocid?.trim();
    if (!ocid) continue;

    const departamento = findBuyerDepartamento(record);
    const buyerId = compiled?.buyer?.id ?? null;
    const buyerName = compiled?.buyer?.name ?? null;
    const tenderId = compiled?.tender?.id ?? null;
    const fecha = (compiled as unknown as { date?: string } | undefined)?.date ?? null;

    for (const item of items) {
      const statusDetails = item.statusDetails?.trim().toUpperCase();
      if (!statusDetails || !UNSUCCESSFUL_STATUS_DETAILS.has(statusDetails)) continue;

      if (!item.id) {
        rejected.push({ raw: item, reason: "item.id ausente" });
        continue;
      }

      const key = `${ocid}::${item.id}`;
      if (seenKey.has(key)) {
        rejected.push({ raw: item, reason: `ítem duplicado dentro del mismo lote: ${key}` });
        continue;
      }
      seenKey.add(key);

      rows.push({
        ocid,
        tenderId,
        itemId: item.id,
        statusDetails: statusDetails as "DESIERTO" | "NULO",
        itemDescription: item.description ?? null,
        buyerId,
        buyerName,
        departamento,
        fecha: fecha ? fecha.slice(0, 10) : null,
      });
    }
  }

  return { rows, rejected };
}

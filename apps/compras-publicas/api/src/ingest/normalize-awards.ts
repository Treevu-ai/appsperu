import type { OcdsParty } from "./normalize.js";

export interface OcdsAwardSupplier {
  id?: string;
  name?: string;
}

export interface OcdsAward {
  id?: string;
  value?: { amount?: number | null; currency?: string };
  date?: string;
  suppliers?: OcdsAwardSupplier[];
}

export interface OcdsRecord {
  ocid?: string;
  compiledRelease?: {
    buyer?: { id?: string; name?: string };
    parties?: OcdsParty[];
    awards?: OcdsAward[];
  };
}

export interface CanonicalAwardRow {
  ocid: string;
  awardId: string;
  buyerId: string | null;
  buyerName: string | null;
  departamento: string | null;
  supplierId: string;
  supplierName: string;
  valorMonto: number | null;
  valorMoneda: string | null;
  fecha: string | null;
}

export interface RejectedAward {
  raw: unknown;
  reason: string;
}

export interface NormalizeAwardsResult {
  rows: CanonicalAwardRow[];
  rejected: RejectedAward[];
}

function findBuyerDepartamento(record: OcdsRecord): string | null {
  const buyerId = record.compiledRelease?.buyer?.id;
  const parties = record.compiledRelease?.parties;
  if (!buyerId || !parties) return null;
  const party = parties.find(
    (p) => p.id === buyerId && (p.roles?.includes("buyer") || p.roles?.includes("procuringEntity"))
  );
  return party?.address?.department?.trim() || null;
}

/**
 * Transforma records OCDS crudos (de `/api/v1/records`, no `/releases` — ver
 * data contract) a filas de adjudicación, una por (award, proveedor). Un
 * record sin `awards` no es un error: significa que ese proceso todavía no
 * llegó a esa etapa — se ignora en silencio, no se cuenta como rechazo.
 * Solo se rechaza un award/proveedor individual con datos incompletos.
 */
export function normalizeAwards(records: OcdsRecord[]): NormalizeAwardsResult {
  const rows: CanonicalAwardRow[] = [];
  const rejected: RejectedAward[] = [];

  for (const record of records) {
    const awards = record.compiledRelease?.awards;
    if (!awards || awards.length === 0) continue;

    if (!record.ocid || record.ocid.trim() === "") {
      rejected.push({ raw: record, reason: "ocid ausente" });
      continue;
    }

    const departamento = findBuyerDepartamento(record);
    const buyerId = record.compiledRelease?.buyer?.id ?? null;
    const buyerName = record.compiledRelease?.buyer?.name ?? null;

    for (const award of awards) {
      if (!award.id) {
        rejected.push({ raw: award, reason: "award_id ausente" });
        continue;
      }
      const suppliers = award.suppliers ?? [];
      if (suppliers.length === 0) {
        rejected.push({ raw: award, reason: `award ${award.id} sin proveedores` });
        continue;
      }

      for (const supplier of suppliers) {
        if (!supplier.id || !supplier.name) {
          rejected.push({ raw: supplier, reason: `proveedor incompleto en award ${award.id}` });
          continue;
        }

        rows.push({
          ocid: record.ocid.trim(),
          awardId: award.id,
          buyerId,
          buyerName,
          departamento,
          supplierId: supplier.id,
          supplierName: supplier.name,
          valorMonto: typeof award.value?.amount === "number" ? award.value.amount : null,
          valorMoneda: award.value?.currency ?? null,
          fecha: award.date ?? null,
        });
      }
    }
  }

  return { rows, rejected };
}

export interface OcdsParty {
  id?: string;
  name?: string;
  address?: {
    streetAddress?: string;
    locality?: string;
    region?: string;
    department?: string;
    countryName?: string;
  };
  roles?: string[];
}

export interface OcdsRelease {
  ocid?: string;
  date?: string;
  publishedDate?: string;
  tag?: string[];
  buyer?: { id?: string; name?: string };
  tender?: {
    id?: string;
    title?: string;
    mainProcurementCategory?: string;
    value?: { amount?: number | null; currency?: string };
    tenderPeriod?: { startDate?: string; endDate?: string };
  };
  parties?: OcdsParty[];
}

export interface CanonicalProcurementRow {
  ocid: string;
  tenderId: string | null;
  sourceId: string | null;
  buyerId: string;
  buyerName: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  categoria: string | null;
  titulo: string | null;
  valorMonto: number | null;
  valorMoneda: string | null;
  fechaPublicacion: string | null;
  tenderInicio: string | null;
  tenderFin: string | null;
  tags: string[];
}

export interface RejectedRelease {
  raw: OcdsRelease;
  reason: string;
}

export interface NormalizeResult {
  rows: CanonicalProcurementRow[];
  rejected: RejectedRelease[];
}

/**
 * El `sourceId` (seace_v2/seace_v3) no viene como campo propio en el release —
 * se infiere del propio `ocid` (ej. "ocds-dgv273-seacev3-1241737"). Devuelve
 * null si el patrón no coincide, en vez de adivinar.
 */
export function inferSourceId(ocid: string): string | null {
  const match = ocid.match(/seacev(\d)/i);
  if (!match) return null;
  return `seace_v${match[1]}`;
}

function findBuyerAddress(release: OcdsRelease): OcdsParty["address"] | null {
  const buyerId = release.buyer?.id;
  if (!buyerId || !release.parties) return null;
  const party = release.parties.find(
    (p) => p.id === buyerId && (p.roles?.includes("buyer") || p.roles?.includes("procuringEntity"))
  );
  return party?.address ?? null;
}

/**
 * Transforma un release OCDS crudo al modelo canónico. Nunca lanza por un
 * release individual — se aísla en `rejected` con su motivo, igual que el
 * conector del MEF.
 */
export function normalizeOcdsReleases(releases: OcdsRelease[]): NormalizeResult {
  const rows: CanonicalProcurementRow[] = [];
  const rejected: RejectedRelease[] = [];

  for (const release of releases) {
    if (!release.ocid || release.ocid.trim() === "") {
      rejected.push({ raw: release, reason: "ocid ausente" });
      continue;
    }
    if (!release.buyer?.id || !release.buyer?.name) {
      rejected.push({ raw: release, reason: "buyer (entidad compradora) ausente o incompleto" });
      continue;
    }

    const address = findBuyerAddress(release);

    rows.push({
      ocid: release.ocid.trim(),
      tenderId: release.tender?.id ?? null,
      sourceId: inferSourceId(release.ocid),
      buyerId: release.buyer.id,
      buyerName: release.buyer.name,
      departamento: address?.department?.trim() || null,
      provincia: address?.region?.trim() || null,
      distrito: address?.locality?.trim() || null,
      categoria: release.tender?.mainProcurementCategory ?? null,
      titulo: release.tender?.title ?? null,
      valorMonto:
        typeof release.tender?.value?.amount === "number" ? release.tender.value.amount : null,
      valorMoneda: release.tender?.value?.currency ?? null,
      fechaPublicacion: release.publishedDate ?? release.date ?? null,
      tenderInicio: release.tender?.tenderPeriod?.startDate ?? null,
      tenderFin: release.tender?.tenderPeriod?.endDate ?? null,
      tags: release.tag ?? [],
    });
  }

  return { rows, rejected };
}

export const MINOR_CONTRACT_LIMIT_2026 = 44_000;
export const MINOR_CONTRACT_RULE_VERSION = "minor-contracts-rules-v1";
export const MINOR_CONTRACT_NORMALIZER_VERSION = "minor-contracts-normalizer-v1";
export const MINOR_CONTRACT_NORMATIVE_VERSION = "ley-32069-ds-009-2025-ef-ds-001-2026-ef";

export type SignalType = "S01" | "S02" | "S03" | "S04" | "S05" | "S06" | "S07" | "S08" | "S09" | "S10" | "S11" | "S12" | "S13";
export type SignalSeverity = "INFO" | "REVISAR" | "PRIORIZAR";

export interface MinorContractForSignals {
  contractingId: string;
  sourceContractingId: string;
  municipalityId: string;
  supplierId: string | null;
  objectNormalized: string | null;
  awardedAmount: number;
  publicationDate: string | null;
  quotationEndDate: string | null;
  quotationCount: number;
  validQuotationCount: number | null;
  evidenceFound: number;
  evidenceExpected: number;
  /**
   * Vector calculado sólo sobre el objeto público normalizado. Nunca incluye
   * nombres de proveedor, montos ni fechas: esos campos se contrastan de forma
   * explícita después de encontrar un par comparable.
   */
  semanticEmbedding?: number[];
  semanticModelVersion?: string;
}

export interface DerivedSignal {
  signalType: SignalType;
  contractingId: string;
  municipalityId: string;
  supplierId: string | null;
  metric: string;
  observedValue: Record<string, unknown>;
  referenceValue: Record<string, unknown> | null;
  severity: SignalSeverity;
  confidence: number;
  modelVersion: string | null;
  explanation: string;
  relatedContractingIds: string[];
}

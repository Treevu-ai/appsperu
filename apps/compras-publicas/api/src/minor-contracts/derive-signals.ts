import { MINOR_CONTRACT_LIMIT_2026, type DerivedSignal, type MinorContractForSignals } from "./types.js";
import { cosineSimilarity } from "./semantic-embeddings.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function addSignal(
  output: DerivedSignal[],
  input: Omit<DerivedSignal, "relatedContractingIds"> & { relatedContractingIds?: string[] }
) {
  output.push({ ...input, relatedContractingIds: input.relatedContractingIds ?? [input.contractingId] });
}

function dateMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function tokenSimilarity(left: string | null, right: string | null): number | null {
  if (!left || !right) return null;
  const a = new Set(left.split(" ").filter((token) => token.length >= 3));
  const b = new Set(right.split(" ").filter((token) => token.length >= 3));
  if (a.size === 0 || b.size === 0) return null;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? null : intersection / union;
}

function concentration(rows: MinorContractForSignals[]) {
  const total = rows.reduce((sum, row) => sum + row.awardedAmount, 0);
  const bySupplier = new Map<string, { amount: number; contracts: number }>();
  for (const row of rows) {
    if (!row.supplierId) continue;
    const current = bySupplier.get(row.supplierId) ?? { amount: 0, contracts: 0 };
    current.amount += row.awardedAmount;
    current.contracts += 1;
    bySupplier.set(row.supplierId, current);
  }
  const shares = [...bySupplier.entries()]
    .map(([supplierId, value]) => ({ supplierId, amount: value.amount, contracts: value.contracts, share: total > 0 ? value.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
  return {
    total,
    supplierCount: shares.length,
    cr1: shares.slice(0, 1).reduce((sum, row) => sum + row.share, 0),
    cr3: shares.slice(0, 3).reduce((sum, row) => sum + row.share, 0),
    hhi: shares.reduce((sum, row) => sum + row.share * row.share, 0),
  };
}

function addSemanticSignals(
  output: DerivedSignal[], left: MinorContractForSignals, right: MinorContractForSignals, distanceDays: number | null,
) {
  // Un registro SEACE puede publicar varios ítems de una misma contratación.
  // Compararlos entre sí no revela una secuencia de necesidades distintas.
  if (left.sourceContractingId === right.sourceContractingId) return;
  if (!left.semanticEmbedding || !right.semanticEmbedding || !left.semanticModelVersion || left.semanticModelVersion !== right.semanticModelVersion) return;
  const similarity = cosineSimilarity(left.semanticEmbedding, right.semanticEmbedding);
  // El umbral sólo preselecciona pares para lectura humana. Se conserva en el
  // resultado para recalibrarlo cuando exista una muestra revisada.
  if (similarity === null || similarity < 0.88) return;
  const related = [left.contractingId, right.contractingId];
  for (const row of [left, right]) {
    addSignal(output, {
      signalType: "S11", contractingId: row.contractingId, municipalityId: row.municipalityId, supplierId: row.supplierId,
      metric: "cosine_similarity(object_normalized_embedding)",
      observedValue: { similarity, comparedContractingId: row.contractingId === left.contractingId ? right.contractingId : left.contractingId },
      referenceValue: { exploratoryThreshold: 0.88 }, severity: "INFO", confidence: similarity, modelVersion: left.semanticModelVersion,
      explanation: "Par de objetos públicamente comparables por embeddings. Es una preselección explicable para lectura humana; no determina que exista una misma necesidad, direccionamiento ni incumplimiento.", relatedContractingIds: related,
    });
  }
  if (distanceDays === null || distanceDays > 90) return;
  for (const row of [left, right]) {
    addSignal(output, {
      signalType: "S12", contractingId: row.contractingId, municipalityId: row.municipalityId, supplierId: row.supplierId,
      metric: "same municipality + embedding similarity + temporal window",
      observedValue: { similarity, distanceDays, windowDays: 90, comparedContractingId: row.contractingId === left.contractingId ? right.contractingId : left.contractingId },
      referenceValue: { exploratoryThreshold: 0.88 }, severity: "INFO", confidence: similarity, modelVersion: left.semanticModelVersion,
      explanation: "Secuencia temporal de objetos semánticamente comparables. Prioriza la revisión de requerimientos y oportunidad; no determina fraccionamiento ni direccionamiento.", relatedContractingIds: related,
    });
  }
  if (!left.supplierId || left.supplierId !== right.supplierId) return;
  for (const row of [left, right]) {
    addSignal(output, {
      signalType: "S13", contractingId: row.contractingId, municipalityId: row.municipalityId, supplierId: left.supplierId,
      metric: "same supplier + embedding similarity + temporal window",
      observedValue: { similarity, distanceDays, windowDays: 90, relatedContracts: 2, jointAmount: left.awardedAmount + right.awardedAmount, comparedContractingId: row.contractingId === left.contractingId ? right.contractingId : left.contractingId },
      referenceValue: { exploratoryThreshold: 0.88 }, severity: "INFO", confidence: similarity, modelVersion: left.semanticModelVersion,
      explanation: "Par recurrente proveedor–objeto–tiempo preseleccionado por embeddings. Requiere documentos primarios y revisión humana; no determina favorecimiento, fraccionamiento ni direccionamiento.", relatedContractingIds: related,
    });
  }
}

/**
 * Produce indicadores explicables, no conclusiones de incumplimiento. S06 es
 * una preselección léxica exploratoria; no se presenta como embedding ni como
 * determinación de similitud semántica hasta contar con muestra calibrada.
 */
export function deriveSignals(contracts: MinorContractForSignals[]): DerivedSignal[] {
  const output: DerivedSignal[] = [];
  const byMunicipality = new Map<string, MinorContractForSignals[]>();
  for (const contract of contracts) {
    const rows = byMunicipality.get(contract.municipalityId) ?? [];
    rows.push(contract);
    byMunicipality.set(contract.municipalityId, rows);
  }

  for (const [municipalityId, rows] of byMunicipality) {
    const bySupplier = new Map<string, MinorContractForSignals[]>();
    for (const row of rows) {
      if (!row.supplierId) continue;
      const supplierRows = bySupplier.get(row.supplierId) ?? [];
      supplierRows.push(row);
      bySupplier.set(row.supplierId, supplierRows);
    }

    for (const [supplierId, supplierRows] of bySupplier) {
      if (supplierRows.length < 2) continue;
      const share = supplierRows.length / rows.length;
      for (const row of supplierRows) {
        addSignal(output, {
          signalType: "S01",
          contractingId: row.contractingId,
          municipalityId,
          supplierId,
          metric: "contracts_supplier / total_contracts_entity",
          observedValue: { contractsSupplier: supplierRows.length, totalContractsEntity: rows.length, share },
          referenceValue: null,
          severity: "INFO",
          confidence: 1,
          modelVersion: null,
          explanation: `Alta recurrencia contractual observable: el proveedor aparece en ${supplierRows.length} de ${rows.length} contrataciones menores de la municipalidad. Requiere revisión humana; no determina favorecimiento.`,
          relatedContractingIds: supplierRows.map((item) => item.contractingId),
        });
      }
    }

    const market = concentration(rows);
    if (market.supplierCount >= 2) {
      for (const row of rows) {
        addSignal(output, {
          signalType: "S02",
          contractingId: row.contractingId,
          municipalityId,
          supplierId: null,
          metric: "CR1/CR3/HHI by awarded amount",
          observedValue: { cr1: market.cr1, cr3: market.cr3, hhi: market.hhi, totalAmount: market.total },
          referenceValue: { supplierCount: market.supplierCount },
          severity: "INFO",
          confidence: 1,
          modelVersion: null,
          explanation: "Concentración descriptiva de adjudicaciones por monto. No se asigna una etiqueta alta/media/baja hasta calibrarla con la distribución observada.",
          relatedContractingIds: rows.map((item) => item.contractingId),
        });
      }
    }

    for (const row of rows) {
      // Un valor UNKNOWN no se transforma en baja concurrencia: ausencia de dato no es ausencia de competencia.
      if (row.validQuotationCount !== null) {
        addSignal(output, {
          signalType: "S03",
          contractingId: row.contractingId,
          municipalityId,
          supplierId: row.supplierId,
          metric: "valid_quotation_count",
          observedValue: { validQuotationCount: row.validQuotationCount },
          referenceValue: { quotationCount: row.quotationCount },
          severity: "INFO",
          confidence: 1,
          modelVersion: null,
          explanation: "Participación observable según cotizaciones con validez conocida. No permite inferir incumplimiento ni competencia efectiva.",
        });
      }

      const publication = dateMs(row.publicationDate);
      const end = dateMs(row.quotationEndDate);
      if (publication !== null && end !== null && end >= publication) {
        const availableHours = (end - publication) / (60 * 60 * 1000);
        addSignal(output, {
          signalType: "S04",
          contractingId: row.contractingId,
          municipalityId,
          supplierId: row.supplierId,
          metric: "quotation_end_timestamp - requirement_publication_timestamp",
          observedValue: { availableHours, availableDays: availableHours / 24 },
          referenceValue: null,
          severity: "INFO",
          confidence: 1,
          modelVersion: null,
          explanation: "Tiempo efectivo registrado entre publicación y cierre. Es descriptivo hasta disponer de percentiles comparables y una regla normativa aplicable.",
        });
      }

      const ratioToLimit = row.awardedAmount / MINOR_CONTRACT_LIMIT_2026;
      if (ratioToLimit >= 0.9) {
        addSignal(output, {
          signalType: "S05",
          contractingId: row.contractingId,
          municipalityId,
          supplierId: row.supplierId,
          metric: "awarded_amount / 44000",
          observedValue: { awardedAmount: row.awardedAmount, ratioToLimit, band: ratioToLimit >= 0.98 ? "98%" : ratioToLimit >= 0.95 ? "95%" : "90%" },
          referenceValue: { limitAmount: MINOR_CONTRACT_LIMIT_2026 },
          severity: "INFO",
          confidence: 1,
          modelVersion: null,
          explanation: "Monto próximo al límite analítico de 8 UIT para 2026. La banda no constituye un umbral jurídico ni acredita fraccionamiento.",
        });
      }

      if (row.evidenceExpected > 0) {
        addSignal(output, {
          signalType: "S09",
          contractingId: row.contractingId,
          municipalityId,
          supplierId: row.supplierId,
          metric: "evidence_found / evidence_expected",
          observedValue: { evidenceFound: row.evidenceFound, evidenceExpected: row.evidenceExpected, coverage: row.evidenceFound / row.evidenceExpected },
          referenceValue: null,
          severity: "INFO",
          confidence: 1,
          modelVersion: null,
          explanation: "Cobertura de evidencia localizada en las fuentes consultadas. La evidencia no localizada no equivale a incumplimiento.",
        });
      }
    }

    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const left = rows[i];
        const right = rows[j];
        const leftDate = dateMs(left.publicationDate);
        const rightDate = dateMs(right.publicationDate);
        const distanceDays = leftDate !== null && rightDate !== null ? Math.abs(leftDate - rightDate) / DAY_MS : null;
        // La capa semántica se evalúa aunque las palabras no coincidan; ésa es
        // precisamente la brecha que no puede resolver S06.
        addSemanticSignals(output, left, right, distanceDays);
        const similarity = tokenSimilarity(left.objectNormalized, right.objectNormalized);
        if (similarity === null || similarity < 0.75) continue;
        const related = [left.contractingId, right.contractingId];
        for (const row of [left, right]) {
          addSignal(output, {
            signalType: "S06",
            contractingId: row.contractingId,
            municipalityId,
            supplierId: row.supplierId,
            metric: "token_jaccard(object_normalized)",
            observedValue: { similarity, comparedContractingId: row.contractingId === left.contractingId ? right.contractingId : left.contractingId },
            referenceValue: { exploratoryThreshold: 0.75 },
            severity: "INFO",
            confidence: similarity,
            modelVersion: "token-jaccard-v1-exploratory",
            explanation: "Candidato por similitud léxica exploratoria de objetos normalizados. No es un embedding semántico calibrado ni una conclusión jurídica.",
            relatedContractingIds: related,
          });
        }

        if (distanceDays !== null && distanceDays <= 90) {
          for (const row of [left, right]) {
            addSignal(output, {
              signalType: "S07",
              contractingId: row.contractingId,
              municipalityId,
              supplierId: row.supplierId,
              metric: "same municipality + lexical similarity + temporal window",
              observedValue: { similarity, distanceDays, windowDays: 90 },
              referenceValue: null,
              severity: "INFO",
              confidence: similarity,
              modelVersion: "token-jaccard-v1-exploratory",
              explanation: "Secuencia temporal de contratos con objetos léxicamente similares. Requiere revisión humana; no determina fraccionamiento.",
              relatedContractingIds: related,
            });
          }
          if (left.supplierId && left.supplierId === right.supplierId) {
            for (const row of [left, right]) {
              addSignal(output, {
                signalType: "S08",
                contractingId: row.contractingId,
                municipalityId,
                supplierId: left.supplierId,
                metric: "same supplier + lexical similarity + temporal window",
                observedValue: { similarity, distanceDays, relatedContracts: 2, jointAmount: left.awardedAmount + right.awardedAmount },
                referenceValue: null,
                severity: "INFO",
                confidence: similarity,
                modelVersion: "token-jaccard-v1-exploratory",
                explanation: "Patrón recurrente proveedor–objeto identificado por una comparación léxica exploratoria. No determina favorecimiento ni fraccionamiento.",
                relatedContractingIds: related,
              });
            }
          }
        }
      }
    }
  }

  return output;
}

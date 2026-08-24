import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { createEmbeddings, getSemanticEmbeddingConfig, semanticContentHash } from "./semantic-embeddings.js";

const DEFAULT_BATCH_SIZE = 32;

interface EmbeddingSourceRow {
  contracting_id: string;
  object_normalized: string;
  content_hash: string | null;
}

export interface GenerateEmbeddingsOptions { department?: string; year?: number; limit?: number; batchSize?: number; }
export interface GenerateEmbeddingsSummary {
  status: "COMPLETED" | "SKIPPED";
  department: string;
  year: number;
  provider?: string;
  model?: string;
  contractsConsidered: number;
  embeddingsCreated: number;
  embeddingsReused: number;
  reason?: string;
}

/**
 * Materializa vectores reproducibles del objeto público normalizado. Por
 * diseño no se ejecuta ni transmite texto a un tercero sin configuración
 * explícita del proveedor en variables de entorno.
 */
export async function generateMinorContractEmbeddings(options: GenerateEmbeddingsOptions = {}): Promise<GenerateEmbeddingsSummary> {
  const department = (options.department ?? "LA LIBERTAD").toUpperCase();
  const year = options.year ?? 2026;
  const config = getSemanticEmbeddingConfig();
  if (!config) return { status: "SKIPPED", department, year, contractsConsidered: 0, embeddingsCreated: 0, embeddingsReused: 0, reason: "Proveedor de embeddings no configurado." };
  const limit = options.limit ?? 0;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(limit) || limit < 0 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("Límite o tamaño de lote inválido.");

  const result = await pool.query<EmbeddingSourceRow>(
    `SELECT c.contracting_id,c.object_normalized,e.content_hash
       FROM minor_contracts c JOIN municipalities m ON m.municipality_id=c.municipality_id
       LEFT JOIN contract_object_embeddings e ON e.contracting_id=c.contracting_id AND e.provider=$3 AND e.model=$4
      WHERE m.department=$1 AND c.year=$2 AND c.object_normalized IS NOT NULL AND c.object_normalized <> ''
      ORDER BY c.contracting_id ${limit > 0 ? "LIMIT $5" : ""}`,
    limit > 0 ? [department, year, config.provider, config.model, limit] : [department, year, config.provider, config.model],
  );
  const pending = result.rows.filter((row) => row.content_hash !== semanticContentHash(row.object_normalized));
  let created = 0;
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const vectors = await createEmbeddings(config, batch.map((row) => row.object_normalized));
    for (let index = 0; index < batch.length; index += 1) {
      const row = batch[index]!; const vector = vectors[index]!;
      await pool.query(
        `INSERT INTO contract_object_embeddings (contracting_id,object_normalized,content_hash,provider,model,dimensions,embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT (contracting_id) DO UPDATE SET object_normalized=EXCLUDED.object_normalized,content_hash=EXCLUDED.content_hash,
           provider=EXCLUDED.provider,model=EXCLUDED.model,dimensions=EXCLUDED.dimensions,embedding=EXCLUDED.embedding,generated_at=now()`,
        [row.contracting_id, row.object_normalized, semanticContentHash(row.object_normalized), config.provider, config.model, vector.length, JSON.stringify(vector)],
      );
      created += 1;
    }
  }
  return { status: "COMPLETED", department, year, provider: config.provider, model: config.model, contractsConsidered: result.rows.length, embeddingsCreated: created, embeddingsReused: result.rows.length - pending.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateMinorContractEmbeddings({
    department: process.env.OECE_DEPARTAMENTO,
    year: process.env.MINOR_CONTRACT_YEAR ? Number(process.env.MINOR_CONTRACT_YEAR) : undefined,
    limit: process.env.SEMANTIC_EMBEDDING_LIMIT ? Number(process.env.SEMANTIC_EMBEDDING_LIMIT) : undefined,
  }).then((summary) => console.log("Embeddings de contratos menores:", summary)).finally(() => pool.end()).catch((error) => { console.error("Generación de embeddings falló:", error); process.exitCode = 1; });
}

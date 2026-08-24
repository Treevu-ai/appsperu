import { createHash } from "node:crypto";

export interface SemanticEmbeddingConfig {
  url: string;
  model: string;
  apiKey?: string;
  provider: string;
  timeoutMs: number;
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: unknown; index?: number }>;
}

/** Only an explicit provider configuration permits sending public object text. */
export function getSemanticEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): SemanticEmbeddingConfig | null {
  const url = env.SEMANTIC_EMBEDDINGS_URL?.trim();
  const model = env.SEMANTIC_EMBEDDINGS_MODEL?.trim();
  if (!url && !model) return null;
  if (!url || !model) throw new Error("Configure SEMANTIC_EMBEDDINGS_URL y SEMANTIC_EMBEDDINGS_MODEL juntos.");
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("SEMANTIC_EMBEDDINGS_URL debe usar http o https.");
  const timeoutMs = Number(env.SEMANTIC_EMBEDDINGS_TIMEOUT_MS ?? "30000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error("SEMANTIC_EMBEDDINGS_TIMEOUT_MS inválido.");
  return { url: parsed.toString(), model, apiKey: env.SEMANTIC_EMBEDDINGS_API_KEY?.trim() || undefined, provider: env.SEMANTIC_EMBEDDINGS_PROVIDER?.trim() || "openai-compatible", timeoutMs };
}

export function semanticContentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function parseEmbedding(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error("El proveedor devolvió un embedding inválido.");
  }
  return value as number[];
}

/** OpenAI-compatible `/embeddings` client. It is deliberately provider-neutral. */
export async function createEmbeddings(config: SemanticEmbeddingConfig, inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, input: inputs }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`El proveedor de embeddings respondió HTTP ${response.status}.`);
    const payload = await response.json() as EmbeddingResponse;
    if (!Array.isArray(payload.data) || payload.data.length !== inputs.length) throw new Error("El proveedor devolvió una cantidad de embeddings inesperada.");
    const vectors = payload.data.map((item, position) => ({ position: item.index ?? position, vector: parseEmbedding(item.embedding) }))
      .sort((left, right) => left.position - right.position).map((item) => item.vector);
    const dimensions = vectors[0]?.length;
    if (!dimensions || vectors.some((vector) => vector.length !== dimensions)) throw new Error("Los embeddings devueltos no tienen dimensiones consistentes.");
    return vectors;
  } finally {
    clearTimeout(timeout);
  }
}

export function cosineSimilarity(left: number[], right: number[]): number | null {
  if (left.length === 0 || left.length !== right.length) return null;
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! ** 2;
    rightNorm += right[index]! ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return null;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

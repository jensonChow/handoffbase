/**
 * Embedding provider abstraction.
 *
 * An EmbeddingProvider turns memory/query text into dense vectors so recall can
 * rank by semantic similarity (pgvector cosine in Postgres, in-JS cosine in the
 * in-memory store) instead of lexical keyword overlap alone. Providers are
 * optional and opt-in: when none is configured the stores fall back to the
 * existing lexical scoring, so the credential-free default path is unchanged.
 */
export interface EmbeddingProvider {
  /** Model identifier persisted alongside each vector (embedding_model column). */
  readonly model: string;
  /** Fixed output dimensionality every returned vector must have. */
  readonly dimensions: number;
  /**
   * Embed a batch of texts. Returns one vector per input, in input order.
   * Implementations must be deterministic for a given (model, dimensions, text).
   */
  embed(texts: readonly string[]): Promise<number[][]>;
}

export class EmbeddingProviderError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "EmbeddingProviderError";
    this.status = status;
  }
}

/**
 * Cosine similarity of two equal-length numeric vectors, in [-1, 1].
 * Returns 0 for zero-magnitude or mismatched-length inputs so a missing or
 * malformed embedding never poisons ranking.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return 0;
    }
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

import type { EmbeddingProvider } from "./provider.js";

export interface MockEmbeddingProviderOptions {
  model?: string;
  dimensions?: number;
}

/**
 * Deterministic, credential-free embedding provider used for CI, offline demos,
 * and tests. It uses the signed feature-hashing trick over word tokens, so texts
 * that share vocabulary land close in cosine space while the output is fully
 * reproducible (no network, no randomness). It is NOT a substitute for a real
 * model's semantic quality — it exists to exercise the semantic-recall code path
 * end to end without a paid API. Real semantic recall comes from a live provider
 * such as QwenEmbeddingProvider.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;

  constructor(options: MockEmbeddingProviderOptions = {}) {
    this.model = options.model ?? "mock-embedding-v1";
    this.dimensions = options.dimensions ?? 256;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    for (const token of tokenize(text)) {
      const bucketHash = fnv1a(token);
      const bucket = bucketHash % this.dimensions;
      // A second hash gives the contribution its sign, reducing collisions.
      const sign = (fnv1a(`sign:${token}`) & 1) === 0 ? 1 : -1;
      vector[bucket] = (vector[bucket] ?? 0) + sign;
    }
    return l2Normalize(vector);
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((term) => term.length >= 2);
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in unsigned range.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function l2Normalize(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }
  if (norm === 0) {
    return vector;
  }
  const magnitude = Math.sqrt(norm);
  return vector.map((value) => value / magnitude);
}

import { EmbeddingProviderError, type EmbeddingProvider } from "./provider.js";

export interface QwenEmbeddingProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  dimensions?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * Qwen Cloud / DashScope embedding provider (OpenAI-compatible `/embeddings`).
 *
 * Defaults to `text-embedding-v4` at 1536 dimensions to match the
 * `memory_embeddings.embedding vector(1536)` column, so the Postgres pgvector
 * recall path works without a schema migration. The API key is required and is
 * redacted from error messages, mirroring QwenMemoryProvider.
 */
export class QwenEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: QwenEmbeddingProviderOptions = {}) {
    if (!options.apiKey) {
      throw new EmbeddingProviderError(
        "Qwen embedding API key is required. Set QWEN_API_KEY or DASHSCOPE_API_KEY."
      );
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
    this.model = options.model ?? "text-embedding-v4";
    this.dimensions = options.dimensions ?? 1536;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  static fromEnv(env: Record<string, string | undefined> = process.env): QwenEmbeddingProvider {
    const dimensionsRaw = env.QWEN_EMBEDDING_DIMENSIONS ?? env.DASHSCOPE_EMBEDDING_DIMENSIONS;
    return new QwenEmbeddingProvider({
      apiKey: env.QWEN_API_KEY ?? env.DASHSCOPE_API_KEY,
      baseUrl: env.QWEN_BASE_URL ?? env.DASHSCOPE_BASE_URL,
      model: env.QWEN_EMBEDDING_MODEL ?? env.DASHSCOPE_EMBEDDING_MODEL,
      dimensions: dimensionsRaw ? Number(dimensionsRaw) : undefined,
      timeoutMs: env.QWEN_TIMEOUT_MS ? Number(env.QWEN_TIMEOUT_MS) : undefined
    });
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.embeddingsEndpoint(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          input: [...texts],
          dimensions: this.dimensions,
          encoding_format: "float"
        }),
        signal: controller.signal
      });

      const text = await response.text();
      if (!response.ok) {
        throw new EmbeddingProviderError(
          `Qwen embedding request failed with HTTP ${response.status}: ${sanitizeForError(text, this.apiKey)}`,
          response.status
        );
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new EmbeddingProviderError("Qwen embedding response was not valid JSON.");
      }

      return this.readEmbeddings(payload, texts.length);
    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new EmbeddingProviderError(`Qwen embedding request timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private readEmbeddings(payload: Record<string, unknown>, expected: number): number[][] {
    const data = payload.data;
    if (!Array.isArray(data) || data.length !== expected) {
      throw new EmbeddingProviderError(
        `Qwen embedding response returned ${Array.isArray(data) ? data.length : 0} vectors for ${expected} inputs.`
      );
    }

    const ordered = [...data].sort((left, right) => indexOf(left) - indexOf(right));
    return ordered.map((entry, position) => {
      const embedding = (entry as Record<string, unknown>)?.embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new EmbeddingProviderError(`Qwen embedding entry ${position} did not include a vector.`);
      }
      return embedding.map((value) => {
        const numeric = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(numeric)) {
          throw new EmbeddingProviderError(`Qwen embedding entry ${position} contained a non-finite value.`);
        }
        return numeric;
      });
    });
  }

  private embeddingsEndpoint(): string {
    const normalized = this.baseUrl.replace(/\/+$/, "");
    if (normalized.endsWith("/embeddings")) {
      return normalized;
    }
    return `${normalized}/embeddings`;
  }
}

function indexOf(entry: unknown): number {
  const index = (entry as Record<string, unknown>)?.index;
  return typeof index === "number" ? index : 0;
}

function truncate(value: string, maxLength = 500): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sanitizeForError(value: string, apiKey: string): string {
  return truncate(value.replaceAll(apiKey, "[REDACTED_QWEN_API_KEY]"));
}

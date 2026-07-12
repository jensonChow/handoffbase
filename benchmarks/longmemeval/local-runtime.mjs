import path from "node:path";
import { pathToFileURL } from "node:url";

export const LONGMEMEVAL_READER_MODES = Object.freeze(["deterministic", "qwen", "openai"]);
export const LONGMEMEVAL_MEMORY_PROVIDER_MODES = Object.freeze(["mock", "qwen"]);
export const LONGMEMEVAL_EMBEDDING_MODES = Object.freeze(["off", "mock", "qwen"]);

const DEFAULT_QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_QWEN_MODEL = "qwen-plus";
const DEFAULT_QWEN_TIMEOUT_MS = 30_000;
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "been", "before", "could", "did", "does", "from",
  "have", "into", "just", "that", "their", "there", "these", "they", "this", "what",
  "when", "where", "which", "with", "would", "your"
]);

export function createDeterministicExtractiveReader(options = {}) {
  const modelLabel = options.modelLabel ?? "deterministic-extractive-reader";
  return {
    mode: "deterministic",
    modelLabel,
    async generate(input) {
      const hypothesis = extractAnswer(input.question.question, input.context.text);
      const inputTokens = estimateTokens(`${input.question.question}\n${input.context.text}`);
      const outputTokens = estimateTokens(hypothesis);
      return {
        hypothesis,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          counting: "estimated"
        }
      };
    }
  };
}

export class LongMemEvalRuntimeConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "LongMemEvalRuntimeConfigurationError";
  }
}

export class LongMemEvalQwenReaderError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "LongMemEvalQwenReaderError";
    this.status = options.status;
  }
}

export function resolveQwenRuntimeConfig(env = process.env) {
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    throw new LongMemEvalRuntimeConfigurationError("Qwen configuration must be supplied as an environment-like object.");
  }

  const apiKey = firstNonEmpty(env.QWEN_API_KEY, env.DASHSCOPE_API_KEY);
  if (apiKey === undefined) {
    throw new LongMemEvalRuntimeConfigurationError(
      "Qwen mode requires QWEN_API_KEY or DASHSCOPE_API_KEY in the process environment."
    );
  }

  const baseUrl = firstNonEmpty(env.QWEN_BASE_URL, env.DASHSCOPE_BASE_URL) ?? DEFAULT_QWEN_BASE_URL;
  validateQwenBaseUrl(baseUrl);
  const model = firstNonEmpty(env.QWEN_MODEL, env.DASHSCOPE_MODEL) ?? DEFAULT_QWEN_MODEL;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) {
    throw new LongMemEvalRuntimeConfigurationError(
      "QWEN_MODEL or DASHSCOPE_MODEL must be a non-secret model identifier using letters, numbers, '.', '_', ':', '/', or '-'."
    );
  }
  if (model === apiKey) {
    throw new LongMemEvalRuntimeConfigurationError(
      "Qwen model configuration must not reuse the API credential value."
    );
  }

  const timeoutMs = parseQwenTimeout(env.QWEN_TIMEOUT_MS);
  return Object.freeze({ apiKey, baseUrl, model, timeoutMs });
}

export function createQwenChatReader(options = {}) {
  const config = options.config ?? resolveQwenRuntimeConfig(options.env ?? process.env);
  validateResolvedQwenConfig(config);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new LongMemEvalRuntimeConfigurationError("Qwen reader mode requires a Fetch API implementation.");
  }

  return {
    mode: "qwen",
    modelLabel: `qwen-chat/${config.model}`,
    async generate(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImpl(qwenChatCompletionsEndpoint(config.baseUrl), {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            messages: [
              {
                role: "system",
                content: [
                  "Answer the question using only the supplied memory context.",
                  "If the context does not contain enough evidence, answer exactly: I don't know.",
                  "Return only the answer, without evaluator commentary or metadata."
                ].join(" ")
              },
              {
                role: "user",
                content: [
                  `Question date: ${input.question.question_date}`,
                  `Question: ${input.question.question}`,
                  "Memory context:",
                  input.context.text || "(empty)"
                ].join("\n")
              }
            ]
          }),
          signal: controller.signal
        });

        if (!response?.ok) {
          const status = Number.isSafeInteger(response?.status) ? response.status : undefined;
          throw new LongMemEvalQwenReaderError(
            status === undefined
              ? "Qwen reader request failed with an HTTP error."
              : `Qwen reader request failed with HTTP ${status}.`,
            { status }
          );
        }

        let payload;
        try {
          payload = JSON.parse(await response.text());
        } catch {
          throw new LongMemEvalQwenReaderError("Qwen reader response was not valid JSON.");
        }
        const hypothesis = readQwenChoiceContent(payload);
        if (hypothesis === undefined) {
          throw new LongMemEvalQwenReaderError(
            "Qwen reader response did not include a non-empty choices[0].message.content value."
          );
        }
        if (hypothesis.includes(config.apiKey)) {
          throw new LongMemEvalQwenReaderError(
            "Qwen reader response was rejected because it contained credential material."
          );
        }
        const usage = readQwenUsage(payload);
        return usage === undefined ? { hypothesis } : { hypothesis, usage };
      } catch (error) {
        if (error instanceof LongMemEvalQwenReaderError) {
          throw error;
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new LongMemEvalQwenReaderError(`Qwen reader request timed out after ${config.timeoutMs}ms.`);
        }
        throw new LongMemEvalQwenReaderError("Qwen reader request failed before receiving a response.");
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export function resolveOpenAIRuntimeConfig(env = process.env) {
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    throw new LongMemEvalRuntimeConfigurationError("OpenAI configuration must be supplied as an environment-like object.");
  }
  const apiKey = firstNonEmpty(env.OPENAI_API_KEY);
  if (apiKey === undefined) {
    throw new LongMemEvalRuntimeConfigurationError("OpenAI mode requires OPENAI_API_KEY in the process environment.");
  }
  const baseUrl = firstNonEmpty(env.OPENAI_BASE_URL) ?? DEFAULT_OPENAI_BASE_URL;
  validateQwenBaseUrl(baseUrl);
  const model = firstNonEmpty(env.OPENAI_MODEL) ?? DEFAULT_OPENAI_MODEL;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) {
    throw new LongMemEvalRuntimeConfigurationError(
      "OPENAI_MODEL must be a non-secret model identifier using letters, numbers, '.', '_', ':', '/', or '-'."
    );
  }
  if (model === apiKey) {
    throw new LongMemEvalRuntimeConfigurationError("OpenAI model configuration must not reuse the API credential value.");
  }
  const timeoutMs = parseQwenTimeout(env.OPENAI_TIMEOUT_MS);
  return Object.freeze({ apiKey, baseUrl, model, timeoutMs });
}

/**
 * OpenAI GPT-4o chat reader. Mirrors the Qwen reader (both are OpenAI-compatible
 * chat completions). Useful for a cross-vendor comparability run and to match
 * the reader model published leaderboards use; for a Qwen-hackathon headline
 * number, prefer the Qwen reader.
 */
export function createOpenAIChatReader(options = {}) {
  const config = options.config ?? resolveOpenAIRuntimeConfig(options.env ?? process.env);
  validateResolvedQwenConfig(config);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new LongMemEvalRuntimeConfigurationError("OpenAI reader mode requires a Fetch API implementation.");
  }

  return {
    mode: "openai",
    modelLabel: `openai-chat/${config.model}`,
    async generate(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImpl(qwenChatCompletionsEndpoint(config.baseUrl), {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            messages: [
              {
                role: "system",
                content: [
                  "Answer the question using only the supplied memory context.",
                  "If the context does not contain enough evidence, answer exactly: I don't know.",
                  "Return only the answer, without evaluator commentary or metadata."
                ].join(" ")
              },
              {
                role: "user",
                content: [
                  `Question date: ${input.question.question_date}`,
                  `Question: ${input.question.question}`,
                  "Memory context:",
                  input.context.text || "(empty)"
                ].join("\n")
              }
            ]
          }),
          signal: controller.signal
        });

        if (!response?.ok) {
          const status = Number.isSafeInteger(response?.status) ? response.status : undefined;
          throw new LongMemEvalQwenReaderError(
            status === undefined
              ? "OpenAI reader request failed with an HTTP error."
              : `OpenAI reader request failed with HTTP ${status}.`,
            { status }
          );
        }

        let payload;
        try {
          payload = JSON.parse(await response.text());
        } catch {
          throw new LongMemEvalQwenReaderError("OpenAI reader response was not valid JSON.");
        }
        const hypothesis = readQwenChoiceContent(payload);
        if (hypothesis === undefined) {
          throw new LongMemEvalQwenReaderError(
            "OpenAI reader response did not include a non-empty choices[0].message.content value."
          );
        }
        if (hypothesis.includes(config.apiKey)) {
          throw new LongMemEvalQwenReaderError(
            "OpenAI reader response was rejected because it contained credential material."
          );
        }
        const usage = readQwenUsage(payload);
        return usage === undefined ? { hypothesis } : { hypothesis, usage };
      } catch (error) {
        if (error instanceof LongMemEvalQwenReaderError) {
          throw error;
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new LongMemEvalQwenReaderError(`OpenAI reader request timed out after ${config.timeoutMs}ms.`);
        }
        throw new LongMemEvalQwenReaderError("OpenAI reader request failed before receiving a response.");
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export async function createLocalHandoffBaseBoundary(options) {
  const rootDir = options?.rootDir;
  if (typeof rootDir !== "string" || rootDir.length === 0) {
    throw new Error("createLocalHandoffBaseBoundary requires rootDir.");
  }

  let core;
  let serviceModule;
  try {
    core = await import(pathToFileURL(path.join(rootDir, "packages/memory-core/dist/index.js")).href);
    serviceModule = await import(pathToFileURL(path.join(rootDir, "dist/services/continuity-memory-service.js")).href);
  } catch (error) {
    const wrapped = new Error(
      "Local HandoffBase build artifacts are missing. Build memory-core and the server before using --backend handoffbase."
    );
    wrapped.cause = error;
    throw wrapped;
  }

  const memoryProviderMode = options.memoryProviderMode ?? "mock";
  if (!LONGMEMEVAL_MEMORY_PROVIDER_MODES.includes(memoryProviderMode)) {
    throw new LongMemEvalRuntimeConfigurationError("memoryProviderMode must be mock or qwen.");
  }
  const embeddingMode = options.embeddingMode ?? "off";
  if (!LONGMEMEVAL_EMBEDDING_MODES.includes(embeddingMode)) {
    throw new LongMemEvalRuntimeConfigurationError("embeddingMode must be off, mock, or qwen.");
  }
  const fixedNow = new Date(options.fixedNow ?? "2026-01-01T00:00:00.000Z");
  if (!Number.isFinite(fixedNow.getTime())) {
    throw new Error("fixedNow must be a valid timestamp.");
  }
  const store = new core.InMemoryMemoryStore({ clock: () => new Date(fixedNow) });
  const provider = options.provider ?? createMemoryProvider({
    core,
    memoryProviderMode,
    env: options.env,
    fetch: options.fetch
  });
  // Pass `null` (not undefined) for "off" so the service never silently
  // auto-enables Qwen embeddings from ambient credentials during a benchmark.
  const embeddingProvider = embeddingMode === "off"
    ? null
    : createEmbeddingProvider({ core, embeddingMode, env: options.env, fetch: options.fetch });
  const service = new serviceModule.ContinuityMemoryService({
    store,
    provider,
    embeddingProvider,
    seedDemoMemories: false
  });
  const rememberReceipts = new Map();

  const embeddingLabel = embeddingMode === "off" ? "" : `/${embeddingMode}-embeddings`;
  return {
    label: `local-continuity-memory-service/${memoryProviderMode}-provider${embeddingLabel}/in-memory`,
    providerMode: memoryProviderMode,
    supportsIdempotency: true,
    async memory_remember(input, adapterContext) {
      const idempotencyKey = adapterContext?.idempotency_key;
      if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
        throw new Error("Local HandoffBase boundary requires an idempotency key.");
      }
      const fingerprint = JSON.stringify(input);
      const existing = rememberReceipts.get(idempotencyKey);
      if (existing !== undefined) {
        if (existing.fingerprint !== fingerprint) {
          throw new Error("Idempotency key was reused with different memory_remember input.");
        }
        return structuredClone(existing.output);
      }
      const output = await service.remember(input, serviceContext(input.scopes));
      rememberReceipts.set(idempotencyKey, { fingerprint, output: structuredClone(output) });
      return output;
    },
    async memory_recall(input) {
      return service.recall(input, serviceContext(input.scopes));
    }
  };
}

function createMemoryProvider({ core, memoryProviderMode, env, fetch }) {
  if (memoryProviderMode === "mock") {
    return new core.MockMemoryProvider();
  }
  const config = resolveQwenRuntimeConfig(env ?? process.env);
  return new core.QwenMemoryProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    fetch
  });
}

function createEmbeddingProvider({ core, embeddingMode, env, fetch }) {
  if (embeddingMode === "mock") {
    return new core.MockEmbeddingProvider();
  }
  const resolvedEnv = env ?? process.env;
  const config = resolveQwenRuntimeConfig(resolvedEnv);
  const model = firstNonEmpty(resolvedEnv.QWEN_EMBEDDING_MODEL, resolvedEnv.DASHSCOPE_EMBEDDING_MODEL);
  const dimensionsRaw = firstNonEmpty(
    resolvedEnv.QWEN_EMBEDDING_DIMENSIONS,
    resolvedEnv.DASHSCOPE_EMBEDDING_DIMENSIONS
  );
  return new core.QwenEmbeddingProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model,
    dimensions: dimensionsRaw ? Number(dimensionsRaw) : undefined,
    timeoutMs: config.timeoutMs,
    fetch
  });
}

function serviceContext(scopes) {
  return {
    caller: {
      tenantId: scopes.tenant_id,
      userId: scopes.user_id,
      actorType: "mcp_host",
      actorId: "longmemeval-adapter",
      allowedAgentProfileIds: [scopes.agent_profile_id],
      allowedProjectIds: [scopes.project_id],
      authMode: "api_key"
    }
  };
}

function extractAnswer(question, context) {
  if (context.trim().length === 0) {
    return "I don't know.";
  }
  const questionTerms = tokenize(question);
  const candidates = context
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:user|assistant):\s+/i.test(line))
    .map((line) => line.replace(/^(?:user|assistant):\s+/i, "").trim())
    .filter(Boolean);
  if (candidates.length === 0) {
    return "I don't know.";
  }

  let best = candidates[0];
  let bestScore = scoreCandidate(best, questionTerms);
  for (const candidate of candidates.slice(1)) {
    const score = scoreCandidate(candidate, questionTerms);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : "I don't know.";
}

function scoreCandidate(candidate, questionTerms) {
  const candidateTerms = new Set(tokenize(candidate));
  return questionTerms.reduce((score, term) => score + (candidateTerms.has(term) ? 1 : 0), 0);
}

function tokenize(value) {
  return [...new Set(value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term)))];
}

function estimateTokens(value) {
  return Math.max(0, Math.ceil(value.length / 4));
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function validateQwenBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new LongMemEvalRuntimeConfigurationError(
      "QWEN_BASE_URL or DASHSCOPE_BASE_URL must be a valid HTTP(S) URL."
    );
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new LongMemEvalRuntimeConfigurationError(
      "QWEN_BASE_URL or DASHSCOPE_BASE_URL must be an HTTP(S) URL without credentials, query parameters, or fragments."
    );
  }
}

function parseQwenTimeout(value) {
  if (value === undefined || value === "") {
    return DEFAULT_QWEN_TIMEOUT_MS;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new LongMemEvalRuntimeConfigurationError("QWEN_TIMEOUT_MS must be a positive integer.");
  }
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs > 600_000) {
    throw new LongMemEvalRuntimeConfigurationError("QWEN_TIMEOUT_MS must be at most 600000.");
  }
  return timeoutMs;
}

function validateResolvedQwenConfig(config) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new LongMemEvalRuntimeConfigurationError("Resolved Qwen configuration must be an object.");
  }
  if (typeof config.apiKey !== "string" || config.apiKey.length === 0) {
    throw new LongMemEvalRuntimeConfigurationError("Resolved Qwen configuration requires an API key.");
  }
  validateQwenBaseUrl(config.baseUrl);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(config.model)) {
    throw new LongMemEvalRuntimeConfigurationError("Resolved Qwen configuration has an invalid model identifier.");
  }
  if (config.model === config.apiKey) {
    throw new LongMemEvalRuntimeConfigurationError(
      "Resolved Qwen model configuration must not reuse the API credential value."
    );
  }
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0 || config.timeoutMs > 600_000) {
    throw new LongMemEvalRuntimeConfigurationError("Resolved Qwen configuration has an invalid timeout.");
  }
}

function qwenChatCompletionsEndpoint(baseUrl) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function readQwenChoiceContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content.trim() : undefined;
}

function readQwenUsage(payload) {
  const usage = payload?.usage;
  if (usage === null || typeof usage !== "object" || Array.isArray(usage)) {
    return undefined;
  }
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens;
  const outputTokens = usage.completion_tokens ?? usage.output_tokens;
  const totalTokens = usage.total_tokens;
  if (![inputTokens, outputTokens, totalTokens].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    return undefined;
  }
  if (totalTokens !== inputTokens + outputTokens) {
    return undefined;
  }
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    counting: "reported"
  };
}

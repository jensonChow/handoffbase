import path from "node:path";
import { pathToFileURL } from "node:url";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "been", "before", "could", "did", "does", "from",
  "have", "into", "just", "that", "their", "there", "these", "they", "this", "what",
  "when", "where", "which", "with", "would", "your"
]);

export function createDeterministicExtractiveReader(options = {}) {
  const modelLabel = options.modelLabel ?? "deterministic-extractive-reader";
  return {
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

  const fixedNow = new Date(options.fixedNow ?? "2026-01-01T00:00:00.000Z");
  if (!Number.isFinite(fixedNow.getTime())) {
    throw new Error("fixedNow must be a valid timestamp.");
  }
  const store = new core.InMemoryMemoryStore({ clock: () => new Date(fixedNow) });
  const provider = new core.MockMemoryProvider();
  const service = new serviceModule.ContinuityMemoryService({
    store,
    provider,
    seedDemoMemories: false
  });
  const rememberReceipts = new Map();

  return {
    label: "local-continuity-memory-service/mock-provider/in-memory",
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

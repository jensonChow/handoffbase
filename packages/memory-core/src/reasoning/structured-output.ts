import {
  isMemoryType,
  isSourceKind,
  isSourceTrust,
  type ClassifiedMemory,
  type ConflictResult,
  type ContextPack,
  type ContextPackMemory,
  type IgnoredMemory,
  type MemoryCandidate,
  type MemoryConflict,
  type MemoryScope,
  type MemoryType,
  type MemoryValidity,
  type ProviderMethod,
  type ReflectionResult,
  type SafetyAssessment,
  type SafetyDecision,
  type SafetyRedaction,
  type SourceKind,
  type SourceTrust,
  type StoredMemory,
  type TraceExplanation,
  type TraceMemoryExplanation
} from "./types.js";

export class StructuredOutputParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredOutputParseError";
  }
}

export class StructuredOutputValidationError extends Error {
  method?: ProviderMethod;

  constructor(message: string, method?: ProviderMethod) {
    super(message);
    this.name = "StructuredOutputValidationError";
    this.method = method;
  }
}

export interface ValidationContext {
  method?: ProviderMethod;
  fallbackScope?: MemoryScope;
  sourceKind?: SourceKind;
  sourceTrust?: SourceTrust;
  approvalMode?: "active" | "pending";
}

type JsonObject = Record<string, unknown>;

const DEFAULT_VALIDITY: MemoryValidity = { status: "unknown" };

const CREDENTIAL_PATTERNS: Array<[SafetyRedaction["kind"], RegExp]> = [
  ["private_key", /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ["credential", /\b(?:api[_-]?key|secret|password|passwd|pwd)["']?\s*[:=]\s*["']?[^"'\s,;]+/gi],
  ["token", /\b(?:token|access_token|refresh_token|authorization)["']?\s*[:=]\s*["']?[^"'\s,;]+/gi],
  ["cookie", /\b(?:cookie|set-cookie)\s*[:=]\s*["']?[^"'\n]+/gi],
  ["token", /\bsk-[A-Za-z0-9_-]{16,}\b/g],
  ["token", /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g]
];

const PERSONAL_DATA_PATTERNS: Array<[SafetyRedaction["kind"], RegExp]> = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  // Phone numbers only: an international "+" prefix, a parenthesised area code,
  // or the classic NNN-NNN-NNNN grouping. The previous \b\+?\d[\d .-]{7,}\d\b
  // also matched ISO dates ("2024-01-15") and dotted version/id strings
  // ("1.2.3.4567890"), corrupting benign memory content and mislabelling it
  // sensitive.
  ["phone", /(?:\+\d[\d\s().-]{6,}\d|\(\d{2,4}\)[\s.-]*\d{3}[\s.-]*\d{3,4}|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b)/g]
];

export function parseProviderJson(raw: string): unknown {
  if (typeof raw !== "string") {
    throw new StructuredOutputParseError("Provider output must be a string.");
  }

  const trimmed = raw.trim();
  const candidates = [
    trimmed,
    extractFencedJson(trimmed),
    extractFirstBalancedJson(trimmed)
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  throw new StructuredOutputParseError("Provider output did not contain valid JSON.");
}

export function validateProviderOutput(
  method: ProviderMethod,
  output: string | unknown,
  context: ValidationContext = {}
):
  | MemoryCandidate[]
  | ClassifiedMemory
  | ConflictResult
  | ContextPack
  | ReflectionResult
  | TraceExplanation {
  const parsed = typeof output === "string" ? parseProviderJson(output) : output;
  const validationContext = { ...context, method };

  switch (method) {
    case "extractMemories":
      return normalizeMemoryCandidateArray(readArrayRoot(parsed, ["candidate_memories", "candidateMemories", "memories"]), validationContext);
    case "classifyMemory":
      return normalizeClassifiedMemory(parsed, validationContext);
    case "detectConflicts":
      return normalizeConflictResult(parsed, validationContext);
    case "buildContextPack":
      return normalizeContextPack(parsed, validationContext);
    case "reflectRun":
      return normalizeReflectionResult(parsed, validationContext);
    case "explainMemoryUsage":
      return normalizeTraceExplanation(parsed, validationContext);
  }
}

export function assessMemorySafety(input: {
  text: string;
  rawSource?: string;
  type: MemoryType;
  sourceTrust: SourceTrust;
}): SafetyAssessment & { redactedText: string; redactedRawSource?: string } {
  const text = input.text;
  const rawSource = input.rawSource;
  const reasons: string[] = [];
  const redactions: SafetyRedaction[] = [];
  let redactedText = text;
  let redactedRawSource = rawSource;
  let credentialDetected = false;
  let personalDetected = false;

  for (const [kind, pattern] of CREDENTIAL_PATTERNS) {
    const replacement = `[REDACTED_${kind.toUpperCase()}]`;
    redactedText = redactedText.replace(pattern, () => {
      credentialDetected = true;
      redactions.push({ kind, replacement });
      return replacement;
    });
    if (redactedRawSource) {
      redactedRawSource = redactedRawSource.replace(pattern, replacement);
    }
  }

  for (const [kind, pattern] of PERSONAL_DATA_PATTERNS) {
    const replacement = `[REDACTED_${kind.toUpperCase()}]`;
    redactedText = redactedText.replace(pattern, () => {
      personalDetected = true;
      redactions.push({ kind, replacement });
      return replacement;
    });
    if (redactedRawSource) {
      redactedRawSource = redactedRawSource.replace(pattern, replacement);
    }
  }

  const untrustedExternal =
    input.sourceTrust === "untrusted_external" ||
    input.sourceTrust === "mcp_tool_description";

  if (credentialDetected) {
    reasons.push("Credential-like sensitive content must not be persisted.");
  }

  if (personalDetected) {
    reasons.push("Personal contact data requires redaction or review before persistence.");
  }

  if (untrustedExternal && input.type === "procedure") {
    reasons.push("Untrusted external content cannot directly create procedure memory.");
  } else if (untrustedExternal) {
    reasons.push("Untrusted external content requires review before persistence.");
  }

  let decision: SafetyDecision = "allow";
  if (credentialDetected || (untrustedExternal && input.type === "procedure")) {
    decision = "reject";
  } else if (personalDetected) {
    decision = "redact";
  } else if (untrustedExternal) {
    decision = "needs_review";
  }

  return {
    decision,
    sensitive: credentialDetected || personalDetected,
    untrustedExternal,
    reasons,
    redactions: dedupeRedactions(redactions),
    redactedText,
    redactedRawSource
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractFencedJson(raw: string): string | null {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? null;
}

function extractFirstBalancedJson(raw: string): string | null {
  const start = raw.search(/[{\[]/);
  if (start < 0) {
    return null;
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack.pop() !== expected) {
        return null;
      }

      if (stack.length === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return null;
}

function readArrayRoot(parsed: unknown, names: string[]): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  const object = asObject(parsed, "provider output");
  for (const name of names) {
    const value = object[name];
    if (Array.isArray(value)) {
      return value;
    }
  }

  throw new StructuredOutputValidationError(`Expected an array at one of: ${names.join(", ")}.`);
}

function normalizeMemoryCandidateArray(values: unknown[], context: ValidationContext): MemoryCandidate[] {
  return values.map((value, index) => normalizeMemoryCandidate(value, context, `candidate_memories[${index}]`));
}

function normalizeClassifiedMemory(value: unknown, context: ValidationContext): ClassifiedMemory {
  const object = asObject(value, "classified memory");
  const candidate = normalizeMemoryCandidate(object, context, "classified memory");
  return {
    ...candidate,
    classificationReason: readOptionalString(object, ["classification_reason", "classificationReason", "rationale"]) ?? candidate.rationale ?? ""
  };
}

function normalizeMemoryCandidate(value: unknown, context: ValidationContext, label: string): MemoryCandidate {
  const object = asObject(value, label);
  const rawType = readRequiredString(object, ["type"], `${label}.type`);
  if (!isMemoryType(rawType)) {
    throw new StructuredOutputValidationError(`Invalid memory type "${rawType}" at ${label}.type.`, context.method);
  }

  const rawText = readRequiredString(object, ["canonicalText", "canonical_text", "text"], `${label}.canonical_text`);
  const rawSourceKind = readOptionalString(object, ["sourceKind", "source_kind"]);
  const sourceKind = normalizeSourceKind(rawSourceKind, context.sourceKind);
  const rawSourceTrust = readOptionalString(object, ["sourceTrust", "source_trust"]);
  const sourceTrust = normalizeSourceTrust(rawSourceTrust, context.sourceTrust, sourceKind);
  const safety = assessMemorySafety({
    text: rawText,
    rawSource: readOptionalString(object, ["rawSource", "raw_source"]),
    type: rawType,
    sourceTrust
  });
  const outputSafety = normalizeSafety(object["safety"], safety);
  const mergedSafety = mergeSafety(outputSafety, safety);
  const status = normalizeMemoryStatus(readOptionalString(object, ["status"]), context.approvalMode, mergedSafety.decision);

  return {
    type: rawType,
    canonicalText: mergedSafety.decision === "allow" || mergedSafety.decision === "needs_review" ? rawText : safety.redactedText,
    scope: normalizeScope(object["scope"], context.fallbackScope),
    validity: normalizeValidity(object["validity"]),
    confidence: readNumber(object, ["confidence"], 0.75, 0, 1),
    importance: readNumber(object, ["importance"], 0.5, 0, 1),
    status,
    sourceKind,
    sourceTrust,
    rawSource: safety.redactedRawSource,
    evidence: readStringArray(object, ["evidence"]),
    tags: readStringArray(object, ["tags"]),
    safety: mergedSafety,
    rationale: readOptionalString(object, ["rationale", "reason"]),
    metadata: normalizeMetadata(object["metadata"])
  };
}

function normalizeConflictResult(value: unknown, context: ValidationContext): ConflictResult {
  const object = asObject(value, "conflict result");
  const conflicts = readArrayRootFromObject(object, ["conflicts"]).map((item, index) => normalizeConflict(item, context, `conflicts[${index}]`));
  const recommendedAction = readEnum(
    object,
    ["recommended_action", "recommendedAction"],
    ["accept", "merge", "supersede", "ask_user", "reject"],
    "accept",
    context.method
  );
  return {
    conflicts,
    recommendedAction,
    reason: readOptionalString(object, ["reason", "rationale"]) ?? ""
  };
}

function normalizeConflict(value: unknown, context: ValidationContext, label: string): MemoryConflict {
  const object = asObject(value, label);
  return {
    existingMemoryId: readRequiredString(object, ["existing_memory_id", "existingMemoryId", "memory_id", "memoryId"], `${label}.existing_memory_id`),
    conflictType: readEnum(object, ["conflict_type", "conflictType"], ["contradiction", "supersedes", "duplicate", "scope_overlap", "none"], "none", context.method),
    severity: readEnum(object, ["severity"], ["low", "medium", "high"], "low", context.method),
    reason: readOptionalString(object, ["reason"]) ?? "",
    suggestedAction: readEnum(object, ["suggested_action", "suggestedAction"], ["ignore", "merge", "supersede_existing", "ask_user", "keep_both"], "ignore", context.method),
    confidence: readNumber(object, ["confidence"], 0.5, 0, 1)
  };
}

function normalizeContextPack(value: unknown, context: ValidationContext): ContextPack {
  const object = asObject(value, "context pack");
  const query = readOptionalString(asObject(object["trace"] ?? {}, "context pack trace"), ["query"]) ?? "";
  const contextBlock = readRequiredString(object, ["context_block", "contextBlock"], "context_pack.context_block");
  const selected = readArrayRootFromObject(object, ["selected_memories", "selectedMemories"]).map((item, index) => normalizeContextPackMemory(item, context, `selected_memories[${index}]`));
  const ignored = readArrayRootFromObject(object, ["ignored_memories", "ignoredMemories"], false).map((item, index) => normalizeIgnoredMemory(item, context, `ignored_memories[${index}]`));
  return {
    contextBlock,
    selectedMemories: selected,
    ignoredMemories: ignored,
    tokenBudget: readNumber(object, ["token_budget", "tokenBudget"], 0, 0, Number.MAX_SAFE_INTEGER),
    estimatedTokens: readNumber(object, ["estimated_tokens", "estimatedTokens"], estimateTokens(contextBlock), 0, Number.MAX_SAFE_INTEGER),
    trace: {
      query,
      scope: normalizeScope(asObject(object["trace"] ?? {}, "context pack trace")["scope"], context.fallbackScope)
    }
  };
}

function normalizeContextPackMemory(value: unknown, context: ValidationContext, label: string): ContextPackMemory {
  const object = asObject(value, label);
  const rawType = readRequiredString(object, ["type"], `${label}.type`);
  if (!isMemoryType(rawType)) {
    throw new StructuredOutputValidationError(`Invalid memory type "${rawType}" at ${label}.type.`, context.method);
  }

  return {
    memoryId: readRequiredString(object, ["memory_id", "memoryId"], `${label}.memory_id`),
    type: rawType,
    text: readRequiredString(object, ["text", "canonical_text", "canonicalText"], `${label}.text`),
    reason: readOptionalString(object, ["reason"]) ?? "",
    score: readNumber(object, ["score"], 0.5, 0, 1)
  };
}

function normalizeIgnoredMemory(value: unknown, context: ValidationContext, label: string): IgnoredMemory {
  const object = asObject(value, label);
  return {
    memoryId: readRequiredString(object, ["memory_id", "memoryId"], `${label}.memory_id`),
    reason: readOptionalString(object, ["reason"]) ?? ""
  };
}

function normalizeReflectionResult(value: unknown, context: ValidationContext): ReflectionResult {
  const object = asObject(value, "reflection result");
  return {
    summary: readOptionalString(object, ["summary"]) ?? "",
    newMemories: readArrayRootFromObject(object, ["new_memories", "newMemories"], false).map((item, index) => normalizeMemoryCandidate(item, context, `new_memories[${index}]`)),
    invalidatedMemories: readArrayRootFromObject(object, ["invalidated_memories", "invalidatedMemories"], false).map((item) => {
      const invalidated = asObject(item, "invalidated memory");
      return {
        memoryId: readRequiredString(invalidated, ["memory_id", "memoryId"], "invalidated_memory.memory_id"),
        reason: readOptionalString(invalidated, ["reason"]) ?? "",
        supersededByCandidateText: readOptionalString(invalidated, ["superseded_by_candidate_text", "supersededByCandidateText"])
      };
    })
  };
}

function normalizeTraceExplanation(value: unknown, context: ValidationContext): TraceExplanation {
  const object = asObject(value, "trace explanation");
  return {
    summary: readOptionalString(object, ["summary"]) ?? "",
    usedMemories: readArrayRootFromObject(object, ["used_memories", "usedMemories"], false).map((item, index) => normalizeTraceMemory(item, context, `used_memories[${index}]`)),
    ignoredMemories: readArrayRootFromObject(object, ["ignored_memories", "ignoredMemories"], false).map((item, index) => normalizeTraceMemory(item, context, `ignored_memories[${index}]`)),
    excludedMemories: readArrayRootFromObject(object, ["excluded_memories", "excludedMemories"], false).map((item, index) => normalizeTraceMemory(item, context, `excluded_memories[${index}]`))
  };
}

function normalizeTraceMemory(value: unknown, context: ValidationContext, label: string): TraceMemoryExplanation {
  const object = asObject(value, label);
  return {
    memoryId: readRequiredString(object, ["memory_id", "memoryId"], `${label}.memory_id`),
    reason: readOptionalString(object, ["reason"]) ?? "",
    confidence: readNumber(object, ["confidence"], 0.5, 0, 1)
  };
}

export function storedMemoryToContextPackMemory(memory: StoredMemory, reason: string, score: number): ContextPackMemory {
  return {
    memoryId: memory.id,
    type: memory.type,
    text: memory.canonicalText,
    reason,
    score: clamp(score, 0, 1)
  };
}

function normalizeScope(value: unknown, fallback: MemoryScope = {}): MemoryScope {
  const object = value === undefined ? {} : asObject(value, "scope");
  return {
    tenantId: readOptionalString(object, ["tenantId", "tenant_id"]) ?? fallback.tenantId,
    userId: readOptionalString(object, ["userId", "user_id"]) ?? fallback.userId,
    agentProfileId: readOptionalString(object, ["agentProfileId", "agent_profile_id"]) ?? fallback.agentProfileId,
    hostId: readOptionalString(object, ["hostId", "host_id"]) ?? fallback.hostId,
    projectId: readOptionalString(object, ["projectId", "project_id"]) ?? fallback.projectId,
    sessionId: readOptionalString(object, ["sessionId", "session_id"]) ?? fallback.sessionId,
    toolId: readOptionalString(object, ["toolId", "tool_id"]) ?? fallback.toolId
  };
}

function normalizeValidity(value: unknown): MemoryValidity {
  if (value === undefined || value === null) {
    return DEFAULT_VALIDITY;
  }

  const object = asObject(value, "validity");
  const status = readEnum(object, ["status"], ["current", "time_bound", "expired", "unknown"], "unknown");
  return {
    status,
    validFrom: readOptionalString(object, ["valid_from", "validFrom"]),
    validUntil: readOptionalString(object, ["valid_until", "validUntil"]),
    reason: readOptionalString(object, ["reason"])
  };
}

function normalizeSafety(value: unknown, fallback: SafetyAssessment): SafetyAssessment {
  if (value === undefined || value === null) {
    return fallback;
  }

  const object = asObject(value, "safety");
  const redactions = readStringArray(object, ["redactions"]).map((replacement) => ({
    kind: "credential" as const,
    replacement
  }));

  return {
    decision: readEnum(object, ["decision"], ["allow", "redact", "reject", "needs_review"], fallback.decision),
    sensitive: readBoolean(object, ["sensitive"], fallback.sensitive),
    untrustedExternal: readBoolean(object, ["untrusted_external", "untrustedExternal"], fallback.untrustedExternal),
    reasons: readStringArray(object, ["reasons"]),
    redactions
  };
}

function mergeSafety(provider: SafetyAssessment, enforced: SafetyAssessment): SafetyAssessment {
  const decisionRank: Record<SafetyDecision, number> = {
    allow: 0,
    needs_review: 1,
    redact: 2,
    reject: 3
  };
  const decision = decisionRank[enforced.decision] > decisionRank[provider.decision]
    ? enforced.decision
    : provider.decision;

  return {
    decision,
    sensitive: provider.sensitive || enforced.sensitive,
    untrustedExternal: provider.untrustedExternal || enforced.untrustedExternal,
    reasons: [...new Set([...provider.reasons, ...enforced.reasons])],
    redactions: dedupeRedactions([...provider.redactions, ...enforced.redactions])
  };
}

function normalizeSourceKind(raw: string | undefined, fallback?: SourceKind): SourceKind {
  if (raw && isSourceKind(raw)) {
    return raw;
  }
  if (fallback) {
    return fallback;
  }
  return "agent_observation";
}

function normalizeSourceTrust(raw: string | undefined, fallback: SourceTrust | undefined, sourceKind: SourceKind): SourceTrust {
  if (raw && isSourceTrust(raw)) {
    return raw;
  }
  if (fallback) {
    return fallback;
  }
  if (sourceKind === "external_web") {
    return "untrusted_external";
  }
  if (sourceKind === "mcp_tool_description") {
    return "mcp_tool_description";
  }
  if (sourceKind === "tool_log") {
    return "tool_output";
  }
  if (sourceKind === "run_summary") {
    return "internal_run";
  }
  if (sourceKind === "user_direct" || sourceKind === "user_correction") {
    return "user_direct";
  }
  return "agent_observation";
}

function normalizeMemoryStatus(raw: string | undefined, approvalMode: "active" | "pending" | undefined, decision: SafetyDecision): "pending" | "active" | "rejected" {
  if (decision === "reject") {
    return "rejected";
  }
  if (raw === "active" || raw === "pending" || raw === "rejected") {
    return raw;
  }
  return approvalMode ?? "pending";
}

function normalizeMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return asObject(value, "metadata");
}

function readArrayRootFromObject(object: JsonObject, names: string[], required = true): unknown[] {
  for (const name of names) {
    const value = object[name];
    if (Array.isArray(value)) {
      return value;
    }
  }

  if (required) {
    throw new StructuredOutputValidationError(`Expected an array at one of: ${names.join(", ")}.`);
  }
  return [];
}

function readRequiredString(object: JsonObject, names: string[], label: string): string {
  const value = readOptionalString(object, names);
  if (!value) {
    throw new StructuredOutputValidationError(`Expected non-empty string at ${label}.`);
  }
  return value;
}

function readOptionalString(object: JsonObject, names: string[]): string | undefined {
  for (const name of names) {
    const value = object[name];
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
  }
  return undefined;
}

function readStringArray(object: JsonObject, names: string[]): string[] {
  for (const name of names) {
    const value = object[name];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  }
  return [];
}

function readNumber(object: JsonObject, names: string[], fallback: number, min: number, max: number): number {
  for (const name of names) {
    const value = object[name];
    if (typeof value === "number" && Number.isFinite(value)) {
      return clamp(value, min, max);
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return clamp(parsed, min, max);
      }
    }
  }
  return fallback;
}

function readBoolean(object: JsonObject, names: string[], fallback: boolean): boolean {
  for (const name of names) {
    const value = object[name];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return fallback;
}

function readEnum<const T extends readonly string[]>(
  object: JsonObject,
  names: string[],
  allowed: T,
  fallback: T[number],
  method?: ProviderMethod
): T[number] {
  const value = readOptionalString(object, names);
  if (value === undefined) {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as T[number];
  }
  throw new StructuredOutputValidationError(`Invalid enum value "${value}".`, method);
}

function asObject(value: unknown, label: string): JsonObject {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  throw new StructuredOutputValidationError(`Expected object for ${label}.`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dedupeRedactions(redactions: SafetyRedaction[]): SafetyRedaction[] {
  const seen = new Set<string>();
  return redactions.filter((redaction) => {
    const key = `${redaction.kind}:${redaction.replacement}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

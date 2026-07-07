import type { MemoryReasoningProvider } from "../provider.js";
import {
  assessMemorySafety,
  estimateTokens,
  storedMemoryToContextPackMemory
} from "../structured-output.js";
import type {
  ClassifiedMemory,
  ClassifyMemoryInput,
  ConflictInput,
  ConflictResult,
  ContextPack,
  ContextPackInput,
  ExtractMemoryInput,
  MemoryCandidate,
  MemoryScope,
  MemoryType,
  ReflectRunInput,
  ReflectionResult,
  SourceKind,
  SourceTrust,
  TraceExplanation,
  TraceInput
} from "../types.js";

export class MockMemoryProvider implements MemoryReasoningProvider {
  async extractMemories(input: ExtractMemoryInput): Promise<MemoryCandidate[]> {
    const text = input.content.trim();
    if (!text) {
      return [];
    }
    return [buildCandidate(text, input.scopes, input.sourceKind, inferTrust(input.sourceKind, input.sourceTrust), input.approvalMode)];
  }

  async classifyMemory(input: ClassifyMemoryInput): Promise<ClassifiedMemory> {
    const candidate = buildCandidate(
      input.text,
      input.scopes,
      input.sourceKind,
      inferTrust(input.sourceKind, input.sourceTrust),
      "pending"
    );
    return {
      ...candidate,
      classificationReason: "Mock classification uses keyword heuristics for local development."
    };
  }

  async detectConflicts(input: ConflictInput): Promise<ConflictResult> {
    const candidateText = normalize(input.candidate.canonicalText);
    const conflicts = input.existingMemories
      .filter((memory) => memory.type === input.candidate.type)
      .filter((memory) => normalize(memory.canonicalText) === candidateText)
      .map((memory) => ({
        existingMemoryId: memory.id,
        conflictType: "duplicate" as const,
        severity: "low" as const,
        reason: "Mock provider found identical canonical text in the same memory type.",
        suggestedAction: "merge" as const,
        confidence: 0.9
      }));

    return {
      conflicts,
      recommendedAction: conflicts.length > 0 ? "merge" : "accept",
      reason: conflicts.length > 0 ? "Duplicate memory candidate." : "No conflicts found by mock provider."
    };
  }

  async buildContextPack(input: ContextPackInput): Promise<ContextPack> {
    const selected = [];
    const ignored = [];
    let usedTokens = 0;

    const candidates = input.memories
      .filter((memory) => memory.status === "active" || memory.status === "pending")
      .filter((memory) => memory.validity.status !== "expired")
      .sort((left, right) => (right.importance + right.confidence) - (left.importance + left.confidence));

    for (const memory of candidates) {
      const tokenCost = estimateTokens(memory.canonicalText);
      if (usedTokens + tokenCost > input.tokenBudget) {
        ignored.push({ memoryId: memory.id, reason: "Skipped to fit the token budget." });
        continue;
      }
      selected.push(storedMemoryToContextPackMemory(memory, "Selected by mock importance and confidence ranking.", memory.importance));
      usedTokens += tokenCost;
    }

    const contextBlock = selected.map((memory) => `- [${memory.type}] ${memory.text}`).join("\n");
    return {
      contextBlock,
      selectedMemories: selected,
      ignoredMemories: ignored,
      tokenBudget: input.tokenBudget,
      estimatedTokens: estimateTokens(contextBlock),
      trace: {
        query: input.query,
        scope: input.scopes
      }
    };
  }

  async reflectRun(input: ReflectRunInput): Promise<ReflectionResult> {
    const content = [input.summary, input.outcome].filter(Boolean).join("\n");
    const memory = buildCandidate(content, input.scopes, "run_summary", input.sourceTrust ?? "internal_run", "pending");
    return {
      summary: input.summary,
      newMemories: content.trim() ? [memory] : [],
      invalidatedMemories: []
    };
  }

  async explainMemoryUsage(input: TraceInput): Promise<TraceExplanation> {
    const used = input.usedMemories ?? input.contextPack?.selectedMemories ?? [];
    const ignored = input.ignoredMemories ?? input.contextPack?.ignoredMemories ?? [];
    const excluded = input.excludedMemories ?? [];

    return {
      summary: "Mock trace explanation.",
      usedMemories: used.map((memory) => ({
        memoryId: memory.memoryId,
        reason: memory.reason || "Selected for context.",
        confidence: "score" in memory ? memory.score : 0.7
      })),
      ignoredMemories: ignored.map((memory) => ({
        memoryId: memory.memoryId,
        reason: memory.reason || "Ignored by context pack builder.",
        confidence: 0.7
      })),
      excludedMemories: excluded.map((memory) => ({
        memoryId: memory.memoryId,
        reason: memory.reason || "Excluded by policy.",
        confidence: 0.7
      }))
    };
  }
}

function buildCandidate(
  text: string,
  scope: MemoryScope,
  sourceKind: SourceKind,
  sourceTrust: SourceTrust,
  approvalMode: "active" | "pending" = "pending"
): MemoryCandidate {
  const type = inferType(text);
  const safety = assessMemorySafety({
    text,
    rawSource: text,
    type,
    sourceTrust
  });

  return {
    type,
    canonicalText: safety.decision === "allow" || safety.decision === "needs_review" ? text : safety.redactedText,
    scope,
    validity: { status: "current" },
    confidence: 0.7,
    importance: type === "procedure" || type === "failure_memory" ? 0.8 : 0.5,
    status: safety.decision === "reject" ? "rejected" : approvalMode,
    sourceKind,
    sourceTrust,
    rawSource: safety.redactedRawSource,
    evidence: [text.slice(0, 160)],
    tags: ["mock"],
    safety,
    rationale: "Generated by deterministic mock provider."
  };
}

function inferType(text: string): MemoryType {
  const lower = text.toLowerCase();
  if (/must|always|required|procedure|必须|总是|以后/.test(lower)) {
    return "procedure";
  }
  if (/avoid|mistake|failed|failure|不要|错误|失败/.test(lower)) {
    return "failure_memory";
  }
  if (/prefer|preference|likes|偏好|喜欢|更看重/.test(lower)) {
    return "user_preference";
  }
  if (/decided|decision|because|决定|取舍/.test(lower)) {
    return "decision_memory";
  }
  return "project_fact";
}

function inferTrust(sourceKind: SourceKind, explicit?: SourceTrust): SourceTrust {
  if (explicit) {
    return explicit;
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

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

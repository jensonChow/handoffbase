import {
  InMemoryMemoryStore,
  MockMemoryProvider,
  PostgresMemoryStore,
  QwenMemoryProvider,
  QwenProviderError,
  rejectSensitiveText,
  type ConflictResult,
  type ContextPackInput,
  type CreateMemoryInput,
  type JsonObject,
  type JsonValue,
  type MemoryCandidate,
  type MemoryConflictRecord,
  type MemoryListFilter,
  type MemoryReasoningProvider,
  type MemoryRecord,
  type MemoryScope,
  type MemorySourceKind,
  type MemoryStatus,
  type MemoryStore,
  type MemoryTrace,
  type RunRecord,
  type SourceKind,
  type SourceTrust,
  type StoredMemory,
} from "@handoffbase/memory-core";
import {
  ScopeGuardError,
  applyCallerAllowedDefaults,
  assertScopedRequestNarrowed,
  callerActor,
  isAuthEnforced,
} from "../auth/scope.js";
import type { CallerContext } from "../auth/types.js";
import type {
  CandidateMemory,
  ContinuityBootstrapInput,
  ContinuityBootstrapOutput,
  MemoryForgetInput,
  MemoryForgetOutput,
  MemoryRecallInput,
  MemoryRecallOutput,
  MemoryReflectInput,
  MemoryReflectOutput,
  MemoryRememberInput,
  MemoryRememberOutput,
  MemorySummary,
  MemoryTraceInput,
  MemoryTraceOutput,
  MemoryType,
  MemoryUpdateInput,
  MemoryUpdateOutput,
} from "../schemas.js";
import type {
  MemoryResourceRequest,
  MemoryResourceResult,
  MemoryService,
  MemoryServiceContext,
  MemoryServiceRuntimeInfo,
} from "./memory-service.js";

const DEFAULT_TENANT_ID = "demo-tenant";
const DEFAULT_USER_ID = "demo-user";
const DEFAULT_AGENT_PROFILE_ID = "opportunity-scout";

export interface ContinuityMemoryServiceOptions {
  store?: MemoryStore;
  provider?: MemoryReasoningProvider;
  seedDemoMemories?: boolean;
}

interface BuiltContextPack {
  contextBlock: string;
  selectedMemoryIds: Map<string, string>;
  selectedMemories: Array<{ memoryId: string; text: string; type: MemoryType; reason: string; score: number }>;
  ignoredMemories: Array<{ memoryId: string; reason: string }>;
  tokenBudget: number;
  estimatedTokens: number;
}

export class ContinuityMemoryService implements MemoryService {
  private readonly store: MemoryStore;
  private readonly provider: MemoryReasoningProvider;
  private readonly runtimeInfo: MemoryServiceRuntimeInfo;
  private readonly seedDemoMemories: boolean;
  private seedPromise?: Promise<void>;

  constructor(options: ContinuityMemoryServiceOptions = {}) {
    this.store = options.store ?? new InMemoryMemoryStore();
    this.provider = options.provider ?? createDefaultReasoningProvider();
    this.runtimeInfo = {
      providerMode: providerModeFor(this.provider),
      storeMode: storeModeFor(this.store),
    };
    this.seedDemoMemories = options.seedDemoMemories ?? true;
  }

  getRuntimeInfo(): MemoryServiceRuntimeInfo {
    return this.runtimeInfo;
  }

  async continuityBootstrap(input: ContinuityBootstrapInput, context: MemoryServiceContext = {}): Promise<ContinuityBootstrapOutput> {
    await this.ensureSeeded();
    const scope = scopeFromBootstrap(input, context.caller);
    const recall = await this.store.recallMemories({
      scope,
      query: input.task_hint ?? "session bootstrap continuity context",
      types: ["identity", "user_preference", "procedure", "project_fact", "tool_memory", "failure_memory", "decision_memory"],
      limit: 12,
      actor: callerActor(context.caller, { type: "mcp_host", id: input.host }),
      metadata: { stage: "continuity_bootstrap" },
    });
    const pack = await this.buildContextPack({
      query: input.task_hint ?? "session bootstrap continuity context",
      scopes: toProviderScope(scope),
      memories: recall.memories.map(toStoredMemory),
      tokenBudget: input.token_budget ?? 1800,
    });
    const trace = await this.addContextPackTrace(recall.trace, pack);

    return {
      context_pack: groupContextPack(pack.selectedMemories.map((memory) => memory.text), recall.memories),
      memory_trace_id: trace.id,
      suggested_next_tools: ["memory_recall", "memory_reflect"],
    };
  }

  async recall(input: MemoryRecallInput, context: MemoryServiceContext = {}): Promise<MemoryRecallOutput> {
    await this.ensureSeeded();
    const scope = scopeFromTool(input.scopes, context.caller);
    const recall = await this.store.recallMemories({
      scope,
      query: input.query,
      types: input.types,
      limit: input.limit ?? 8,
      actor: callerActor(context.caller, { type: "mcp_host", id: scope.hostId }),
      metadata: { stage: "memory_recall" },
    });
    const pack = await this.buildContextPack({
      query: input.query,
      scopes: toProviderScope(scope),
      memories: recall.memories.map(toStoredMemory),
      tokenBudget: input.token_budget ?? 900,
    });
    const trace = await this.addContextPackTrace(recall.trace, pack);

    return {
      memories: recall.memories.map((memory) => toMemorySummary(memory, pack.selectedMemoryIds.get(memory.id))),
      context_block: pack.contextBlock,
      trace_id: trace.id,
    };
  }

  async remember(input: MemoryRememberInput, context: MemoryServiceContext = {}): Promise<MemoryRememberOutput> {
    await this.ensureSeeded();
    const sensitive = rejectSensitiveText(input.content);
    if (!sensitive.ok) {
      return {
        candidate_memories: [],
        warnings: sensitive.findings.map((finding) => `rejected_sensitive_${finding.type}:${finding.pattern}`),
      };
    }

    const scope = scopeFromTool(input.scopes, context.caller);
    const sourceKind = sourceKindFromRemember(input.source);
    const candidates = await this.provider.extractMemories({
      content: input.content,
      scopes: toProviderScope(scope),
      sourceKind,
      sourceTrust: sourceTrustForKind(sourceKind),
      approvalMode: input.approval_mode ?? "pending",
      now: new Date().toISOString(),
    });
    const stored: CandidateMemory[] = [];
    const warnings: string[] = [];

    for (const candidate of candidates) {
      if (candidate.status === "rejected" || candidate.safety.decision === "reject") {
        warnings.push(candidate.safety.reasons.join("; ") || "provider rejected memory candidate");
        stored.push(toCandidateMemory(candidate, "rejected"));
        continue;
      }

      const memoryInput = toCreateMemoryInput(candidate, scope, input.approval_mode ?? candidate.status);
      assertScopedRequestNarrowed(memoryInput.scope, context.caller, "memory_remember");
      const existing = await this.store.listMemories({ scope, types: [memoryInput.type] });
      const conflict = await this.provider.detectConflicts({
        candidate,
        existingMemories: existing.map(toStoredMemory),
        now: new Date().toISOString(),
      });

      if (conflict.recommendedAction === "reject") {
        warnings.push(conflict.reason || "conflict provider rejected candidate");
        stored.push(toCandidateMemory(candidate, "rejected"));
        continue;
      }

      const needsConflictReview = shouldHoldCandidateForConflictReview(conflict);
      const result = await this.store.addMemory(
        {
          ...memoryInput,
          status: needsConflictReview ? "pending" : memoryInput.status,
        },
        {
          actor: callerActor(context.caller, { type: "agent", id: "memory_remember" }),
          reason: conflict.reason || "Created from memory_remember.",
          metadata: {
            provider_conflicts: conflict.conflicts.length,
            provider_recommended_action: conflict.recommendedAction,
            source: input.source,
          },
        },
      );
      await persistConflictRecords(this.store, result.memory, conflict, input.source, context.caller);
      stored.push(toCandidateMemory(candidate, result.memory.status, result.memory.id));
    }

    return {
      candidate_memories: stored,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  async reflect(input: MemoryReflectInput, context: MemoryServiceContext = {}): Promise<MemoryReflectOutput> {
    await this.ensureSeeded();
    const scope = scopeFromTool(input.scopes, context.caller);
    const run = await this.store.addRun({
      id: input.run_id,
      tenantId: scope.tenantId,
      userId: scope.userId,
      hostId: scope.hostId,
      agentProfileId: scope.agentProfileId,
      projectId: scope.projectId,
      summary: input.summary,
      outcome: input.outcome,
      metadata: {
        messages_count: input.messages?.length ?? 0,
        tool_calls_count: input.tool_calls?.length ?? 0,
      },
    });
    const reflection = await this.provider.reflectRun({
      runId: run.id,
      summary: input.summary,
      scopes: toProviderScope(scope),
      sourceTrust: "internal_run",
      messages: input.messages,
      toolCalls: input.tool_calls,
      outcome: input.outcome,
      now: new Date().toISOString(),
    });
    const newMemories: CandidateMemory[] = [];

    for (const candidate of reflection.newMemories) {
      if (candidate.status === "rejected" || candidate.safety.decision === "reject") {
        newMemories.push(toCandidateMemory(candidate, "rejected"));
        continue;
      }

      const memoryInput = toCreateMemoryInput(candidate, scope, "pending");
      assertScopedRequestNarrowed(memoryInput.scope, context.caller, "memory_reflect");
      const result = await this.store.addMemory(memoryInput, {
        actor: callerActor(context.caller, { type: "agent", id: "memory_reflect" }),
        reason: reflection.summary,
        runId: run.id,
      });
      newMemories.push(toCandidateMemory(candidate, result.memory.status, result.memory.id));
    }

    for (const invalidated of reflection.invalidatedMemories) {
      const memory = await this.store.getMemory(invalidated.memoryId);
      if (memory) {
        assertScopedRequestNarrowed(memory.scope, context.caller, "memory_reflect invalidation");
        await this.store.updateMemory(
          invalidated.memoryId,
          { status: "invalidated", validUntil: new Date().toISOString() },
          {
            actor: callerActor(context.caller, { type: "agent", id: "memory_reflect" }),
            reason: invalidated.reason,
            runId: run.id,
          },
        );
      }
    }

    const trace = await this.store.addTrace({
      tenantId: scope.tenantId,
      runId: run.id,
      query: input.summary,
      selectedMemoryIds: newMemories.map((memory) => memory.id).filter((id): id is string => Boolean(id)),
      contextPack: reflection.summary,
      metadata: { stage: "memory_reflect" },
    });

    return {
      new_memories: newMemories,
      invalidated_memories: reflection.invalidatedMemories.map((memory) => memory.memoryId),
      trace_id: trace.id,
    };
  }

  async update(input: MemoryUpdateInput, context: MemoryServiceContext = {}): Promise<MemoryUpdateOutput> {
    await this.ensureSeeded();
    await this.requireMutableMemory(input.memory_id, context.caller, "memory_update");
    const result = await this.store.updateMemory(
      input.memory_id,
      {
        canonicalText: input.patch.text,
        status: input.patch.status,
        confidence: input.patch.confidence,
        importance: input.patch.importance,
        validFrom: input.patch.valid_from,
        validUntil: input.patch.valid_until,
        metadata: toJsonObject(input.patch.metadata),
      },
      {
        actor: callerActor(context.caller, { type: "user", id: "memory_update" }),
        reason: input.reason ?? "Updated through memory_update.",
      },
    );

    return {
      memory: {
        id: result.memory.id,
        text: result.memory.canonicalText,
        status: result.memory.status,
      },
      event_id: result.event.id,
      warnings: input.supersede_conflicting ? ["supersede_conflicting is accepted but conflict merge is not automatic in the MVP"] : undefined,
    };
  }

  async forget(input: MemoryForgetInput, context: MemoryServiceContext = {}): Promise<MemoryForgetOutput> {
    await this.ensureSeeded();
    await this.requireMutableMemory(input.memory_id, context.caller, "memory_forget");
    const statusByMode: Record<MemoryForgetInput["mode"], MemoryStatus> = {
      archive: "archived",
      expire: "expired",
      hard_delete: "deleted",
      invalidate: "invalidated",
    };
    const status = statusByMode[input.mode];
    const result =
      input.mode === "hard_delete"
        ? await this.store.deleteMemory(input.memory_id, {
            actor: callerActor(context.caller, { type: "user", id: "memory_forget" }),
            reason: input.reason,
          })
        : await this.store.updateMemory(
            input.memory_id,
            {
              status,
              validUntil: status === "expired" || status === "invalidated" ? new Date().toISOString() : undefined,
            },
            {
              actor: callerActor(context.caller, { type: "user", id: "memory_forget" }),
              reason: input.reason,
            },
          );

    return {
      memory_id: result.memory.id,
      mode: input.mode,
      status: result.memory.status,
      event_id: result.event.id,
    };
  }

  async trace(input: MemoryTraceInput, context: MemoryServiceContext = {}): Promise<MemoryTraceOutput> {
    await this.ensureSeeded();
    const trace = await this.store.getTrace(input.trace_id);
    if (!trace) {
      return {
        used_memories: [],
        ignored_memories: [],
        excluded_memories: [{ memory_id: input.trace_id, reason: "Trace not found." }],
      };
    }
    await this.assertTraceReadable(trace, context.caller, "memory_trace");

    const selected = await this.memoriesById(trace.selectedMemoryIds);
    const ignored = await this.memoriesById(trace.ignoredMemoryIds);
    const explanation = await this.provider.explainMemoryUsage({
      traceId: trace.id,
      query: trace.query,
      usedMemories: selected.map((memory) => ({
        memoryId: memory.id,
        type: memory.type,
        text: memory.canonicalText,
        reason: trace.selectionReasons[memory.id] ?? "Selected for context.",
        score: memory.importance,
      })),
      ignoredMemories: ignored.map((memory) => ({
        memoryId: memory.id,
        reason: trace.selectionReasons[memory.id] ?? "Ignored by lifecycle or validity filtering.",
      })),
    });

    return {
      used_memories: explanation.usedMemories.map((memory) => ({
        memory_id: memory.memoryId,
        reason: memory.reason,
      })),
      ignored_memories: explanation.ignoredMemories.map((memory) => ({
        memory_id: memory.memoryId,
        reason: memory.reason,
      })),
      excluded_memories: explanation.excludedMemories.map((memory) => ({
        memory_id: memory.memoryId,
        reason: memory.reason,
      })),
    };
  }

  async readResource(input: MemoryResourceRequest, context: MemoryServiceContext = {}): Promise<MemoryResourceResult> {
    await this.ensureSeeded();
    const payload = await this.resourcePayload(input, context.caller);
    return {
      uri: input.uri,
      mimeType: "application/json",
      text: JSON.stringify(payload, null, 2),
    };
  }

  private async resourcePayload(input: MemoryResourceRequest, caller: CallerContext | undefined): Promise<unknown> {
    if (input.name === "memory-trace") {
      const trace = await this.store.getTrace(input.variables.trace_id);
      if (trace) {
        await this.assertTraceReadable(trace, caller, "memory-trace resource");
      }
      return trace ?? { uri: input.uri, status: "not_found" };
    }

    if (input.name === "run-summary") {
      const run = await this.store.getRun(input.variables.run_id);
      if (run) {
        assertScopedRequestNarrowed(scopeFromRun(run), caller, "run-summary resource");
      }
      return run ?? { uri: input.uri, status: "not_found" };
    }

    if (input.name === "vault-conflicts") {
      return await this.conflictResourcePayload(input, caller);
    }

    const filter = resourceFilter(input, caller);
    const memories = await this.store.listMemories(filter);
    return {
      uri: input.uri,
      count: memories.length,
      memories: memories.map((memory) => toMemorySummary(memory)),
    };
  }

  private async conflictResourcePayload(
    input: MemoryResourceRequest,
    caller: CallerContext | undefined,
  ): Promise<unknown> {
    const conflicts = await this.store.listConflicts({
      tenantId: isAuthEnforced(caller) ? caller.tenantId : undefined,
      statuses: ["open"],
    });
    const memoryIds = [
      ...new Set(
        conflicts.flatMap((conflict) =>
          [conflict.candidateMemoryId, conflict.existingMemoryId].filter((id): id is string => Boolean(id)),
        ),
      ),
    ];
    const memories = await this.memoriesById(memoryIds);
    const memoryById = new Map(memories.map((memory) => [memory.id, memory]));

    if (isAuthEnforced(caller)) {
      for (const memory of memories) {
        assertScopedRequestNarrowed(memory.scope, caller, "vault-conflicts resource");
      }
    }

    return {
      uri: input.uri,
      count: conflicts.length,
      conflicts: conflicts.map((conflict) => toConflictResourceItem(conflict, memoryById)),
    };
  }

  private async memoriesById(ids: string[]): Promise<MemoryRecord[]> {
    const memories = await Promise.all(ids.map((id) => this.store.getMemory(id)));
    return memories.filter((memory): memory is MemoryRecord => Boolean(memory));
  }

  private async buildContextPack(input: ContextPackInput): Promise<BuiltContextPack> {
    const pack = await this.provider.buildContextPack(input);
    return {
      contextBlock: pack.contextBlock,
      selectedMemoryIds: new Map(pack.selectedMemories.map((memory) => [memory.memoryId, memory.reason])),
      selectedMemories: pack.selectedMemories,
      ignoredMemories: pack.ignoredMemories,
      tokenBudget: pack.tokenBudget,
      estimatedTokens: pack.estimatedTokens,
    };
  }

  private async addContextPackTrace(retrievalTrace: MemoryTrace, pack: BuiltContextPack): Promise<MemoryTrace> {
    const selectionReasons = Object.fromEntries([
      ...pack.selectedMemories.map((memory) => [memory.memoryId, memory.reason] as const),
      ...pack.ignoredMemories.map((memory) => [memory.memoryId, memory.reason] as const),
    ]);

    return await this.store.addTrace({
      tenantId: retrievalTrace.tenantId,
      runId: retrievalTrace.runId,
      query: retrievalTrace.query,
      selectedMemoryIds: pack.selectedMemories.map((memory) => memory.memoryId),
      ignoredMemoryIds: pack.ignoredMemories.map((memory) => memory.memoryId),
      contextPack: pack.contextBlock,
      selectionReasons,
      metadata: {
        ...retrievalTrace.metadata,
        stage: "context_pack",
        retrieval_trace_id: retrievalTrace.id,
        token_budget: pack.tokenBudget,
        estimated_tokens: pack.estimatedTokens,
      },
    });
  }

  private async ensureSeeded(): Promise<void> {
    if (!this.seedDemoMemories) {
      return;
    }
    if (!this.seedPromise) {
      this.seedPromise = seedDemoMemories(this.store);
    }
    await this.seedPromise;
  }

  private async requireMutableMemory(
    memoryId: string,
    caller: CallerContext | undefined,
    operation: string,
  ): Promise<MemoryRecord> {
    const memory = await this.store.getMemory(memoryId);
    if (!memory) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    assertScopedRequestNarrowed(memory.scope, caller, operation);
    return memory;
  }

  private async assertTraceReadable(
    trace: MemoryTrace,
    caller: CallerContext | undefined,
    operation: string,
  ): Promise<void> {
    if (!isAuthEnforced(caller)) {
      return;
    }
    if (trace.tenantId !== caller.tenantId) {
      throw new ScopeGuardError(`${operation} is not authorized for tenant ${trace.tenantId}.`);
    }

    if (trace.runId) {
      const run = await this.store.getRun(trace.runId);
      if (run) {
        assertScopedRequestNarrowed(scopeFromRun(run), caller, operation);
        return;
      }
    }

    const memoryIds = [...trace.selectedMemoryIds, ...trace.ignoredMemoryIds];
    if (memoryIds.length === 0) {
      throw new ScopeGuardError(`${operation} cannot verify caller user scope for trace ${trace.id}.`);
    }

    let verified = 0;
    for (const memory of await this.memoriesById(memoryIds)) {
      assertScopedRequestNarrowed(memory.scope, caller, operation);
      verified += 1;
    }
    if (verified === 0) {
      throw new ScopeGuardError(`${operation} cannot verify caller user scope for trace ${trace.id}.`);
    }
  }
}

export function createDefaultMemoryService(): ContinuityMemoryService {
  return new ContinuityMemoryService();
}

function createDefaultReasoningProvider(): MemoryReasoningProvider {
  if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) {
    try {
      return QwenMemoryProvider.fromEnv();
    } catch (error) {
      if (!(error instanceof QwenProviderError)) {
        throw error;
      }
    }
  }
  return new MockMemoryProvider();
}

function providerModeFor(provider: MemoryReasoningProvider): MemoryServiceRuntimeInfo["providerMode"] {
  if (provider instanceof QwenMemoryProvider) {
    return "qwen";
  }
  if (provider instanceof MockMemoryProvider) {
    return "mock";
  }
  return "custom";
}

function storeModeFor(store: MemoryStore): MemoryServiceRuntimeInfo["storeMode"] {
  if (store instanceof InMemoryMemoryStore) {
    return "in-memory";
  }
  if (store instanceof PostgresMemoryStore) {
    return "postgres";
  }
  return "custom";
}

function scopeFromBootstrap(input: ContinuityBootstrapInput, caller: CallerContext | undefined): MemoryScope {
  const scope = applyCallerAllowedDefaults({
    tenantId: isAuthEnforced(caller) ? caller.tenantId : DEFAULT_TENANT_ID,
    userId: input.user_id,
    agentProfileId: input.agent_profile,
    hostId: input.host,
    projectId: input.project?.id ?? input.project?.name,
    sessionId: input.session_id,
  }, caller);
  assertScopedRequestNarrowed(scope, caller, "continuity_bootstrap");
  return scope;
}

function scopeFromTool(scope: MemoryRecallInput["scopes"], caller: CallerContext | undefined): MemoryScope {
  const resolved = applyCallerAllowedDefaults({
    tenantId: scope?.tenant_id ?? (isAuthEnforced(caller) ? caller.tenantId : DEFAULT_TENANT_ID),
    userId: scope?.user_id ?? (isAuthEnforced(caller) ? caller.userId : DEFAULT_USER_ID),
    agentProfileId: scope?.agent_profile_id ?? (isAuthEnforced(caller) ? undefined : DEFAULT_AGENT_PROFILE_ID),
    hostId: scope?.host_id,
    projectId: scope?.project_id,
    sessionId: scope?.session_id,
    toolId: scope?.tool_id,
  }, caller);
  assertScopedRequestNarrowed(resolved, caller, "tool scope");
  return resolved;
}

function toProviderScope(scope: MemoryScope): Record<string, string | undefined> {
  return {
    tenantId: scope.tenantId,
    userId: scope.userId,
    agentProfileId: scope.agentProfileId,
    hostId: scope.hostId,
    projectId: scope.projectId,
    sessionId: scope.sessionId,
    toolId: scope.toolId,
  };
}

function toStoredMemory(memory: MemoryRecord): StoredMemory {
  return {
    id: memory.id,
    type: memory.type,
    canonicalText: memory.canonicalText,
    scope: toProviderScope(memory.scope),
    validity: {
      status: memory.validUntil ? "time_bound" : "current",
      validFrom: memory.validFrom?.toISOString(),
      validUntil: memory.validUntil?.toISOString(),
    },
    confidence: memory.confidence,
    importance: memory.importance,
    status: memory.status === "deleted" || memory.status === "invalidated" || memory.status === "archived" ? "expired" : memory.status,
    sourceKind: mapCoreSourceKind(memory.sourceKind),
    metadata: memory.metadata,
  };
}

function toCreateMemoryInput(candidate: MemoryCandidate, fallbackScope: MemoryScope, status: MemoryStatus): CreateMemoryInput {
  return {
    scope: normalizeCandidateScope(candidate.scope, fallbackScope),
    type: candidate.type,
    canonicalText: candidate.canonicalText,
    rawSource: candidate.rawSource,
    sourceKind: mapProviderSourceKind(candidate.sourceKind),
    status: status === "rejected" ? "pending" : status,
    confidence: candidate.confidence,
    importance: candidate.importance,
    validFrom: candidate.validity.validFrom,
    validUntil: candidate.validity.validUntil,
    metadata: toJsonObject({
      ...(candidate.metadata ?? {}),
      sourceTrust: candidate.sourceTrust,
      safetyDecision: candidate.safety.decision,
      rationale: candidate.rationale,
      tags: candidate.tags ?? [],
    }),
  };
}

function normalizeCandidateScope(scope: MemoryCandidate["scope"], fallback: MemoryScope): MemoryScope {
  return {
    tenantId: scope.tenantId ?? fallback.tenantId,
    userId: scope.userId ?? fallback.userId,
    agentProfileId: scope.agentProfileId ?? fallback.agentProfileId,
    hostId: scope.hostId ?? fallback.hostId,
    projectId: scope.projectId ?? fallback.projectId,
    sessionId: scope.sessionId ?? fallback.sessionId,
    toolId: scope.toolId ?? fallback.toolId,
  };
}

function toCandidateMemory(candidate: MemoryCandidate, status: MemoryStatus | "rejected", id?: string): CandidateMemory {
  return {
    id: id ?? (candidate.metadata?.id as string | undefined),
    type: candidate.type,
    text: candidate.canonicalText,
    confidence: candidate.confidence,
    status,
    reason: candidate.rationale ?? candidate.safety.reasons.join("; "),
  };
}

function shouldHoldCandidateForConflictReview(conflict: ConflictResult): boolean {
  if (!conflict.conflicts.some(isRealProviderConflict)) {
    return false;
  }

  if (conflict.recommendedAction === "ask_user" || conflict.recommendedAction === "merge" || conflict.recommendedAction === "supersede") {
    return true;
  }

  return conflict.conflicts.some(
    (item) => item.suggestedAction === "ask_user" || item.suggestedAction === "merge" || item.suggestedAction === "supersede_existing",
  );
}

async function persistConflictRecords(
  store: MemoryStore,
  candidateMemory: MemoryRecord,
  conflict: ConflictResult,
  source: MemoryRememberInput["source"],
  caller: CallerContext | undefined,
): Promise<void> {
  for (const item of conflict.conflicts.filter(isRealProviderConflict)) {
    await store.addConflict(
      {
        tenantId: candidateMemory.scope.tenantId,
        candidateMemoryId: candidateMemory.id,
        existingMemoryId: item.existingMemoryId,
        conflictType: item.conflictType,
        severity: item.severity,
        recommendedAction: item.suggestedAction,
        reason: item.reason || conflict.reason,
        confidence: item.confidence,
        metadata: toJsonObject({
          source,
          provider_recommended_action: conflict.recommendedAction,
          provider_reason: conflict.reason,
        }),
      },
      {
        actor: callerActor(caller, { type: "agent", id: "memory_remember" }),
        reason: item.reason || conflict.reason,
      },
    );
  }
}

function isRealProviderConflict(item: ConflictResult["conflicts"][number]): boolean {
  return item.conflictType !== "none";
}

function toMemorySummary(memory: MemoryRecord, reason?: string): MemorySummary {
  return {
    id: memory.id,
    type: memory.type,
    text: memory.canonicalText,
    score: Math.min(1, memory.importance + memory.confidence * 0.1),
    reason: reason ?? `${memory.status} ${memory.type} memory`,
    status: memory.status,
  };
}

function toConflictResourceItem(conflict: MemoryConflictRecord, memoryById: Map<string, MemoryRecord>): JsonObject {
  const candidate = conflict.candidateMemoryId ? memoryById.get(conflict.candidateMemoryId) : undefined;
  const existing = conflict.existingMemoryId ? memoryById.get(conflict.existingMemoryId) : undefined;

  return toJsonObject({
    id: conflict.id,
    conflict_type: conflict.conflictType,
    severity: conflict.severity,
    recommended_action: conflict.recommendedAction,
    status: conflict.status,
    reason: conflict.reason,
    confidence: conflict.confidence,
    candidate_memory_id: conflict.candidateMemoryId,
    existing_memory_id: conflict.existingMemoryId,
    candidate_memory: candidate ? toMemorySummary(candidate) : null,
    existing_memory: existing ? toMemorySummary(existing) : null,
    created_at: conflict.createdAt,
    resolved_at: conflict.resolvedAt,
    metadata: conflict.metadata,
  }) ?? {};
}

function sourceKindFromRemember(source: MemoryRememberInput["source"]): SourceKind {
  if (source === "user_correction") return "user_correction";
  if (source === "explicit_user_request") return "user_direct";
  if (source === "agent_observation") return "agent_observation";
  return "run_summary";
}

function sourceTrustForKind(sourceKind: SourceKind): SourceTrust {
  if (sourceKind === "external_web") return "untrusted_external";
  if (sourceKind === "mcp_tool_description") return "mcp_tool_description";
  if (sourceKind === "tool_log") return "tool_output";
  if (sourceKind === "run_summary") return "internal_run";
  if (sourceKind === "user_correction" || sourceKind === "user_direct") return "user_direct";
  return "agent_observation";
}

function mapProviderSourceKind(sourceKind: SourceKind): MemorySourceKind {
  const map: Record<SourceKind, MemorySourceKind> = {
    agent_observation: "agent_observation",
    external_web: "external_web",
    import: "manual_import",
    mcp_tool_description: "mcp_tool_description",
    run_summary: "run_summary",
    tool_log: "tool_result",
    user_correction: "user_correction",
    user_direct: "user_assertion",
  };
  return map[sourceKind];
}

function mapCoreSourceKind(sourceKind: MemorySourceKind): SourceKind {
  const map: Partial<Record<MemorySourceKind, SourceKind>> = {
    agent_observation: "agent_observation",
    external_content: "external_web",
    external_web: "external_web",
    manual_import: "import",
    mcp_tool_description: "mcp_tool_description",
    post_run_reflection: "run_summary",
    run_reflection: "run_summary",
    run_summary: "run_summary",
    tool_result: "tool_log",
    user_assertion: "user_direct",
    user_correction: "user_correction",
    user_instruction: "user_direct",
    user_statement: "user_direct",
  };
  return map[sourceKind] ?? "agent_observation";
}

function groupContextPack(selectedTexts: string[], memories: MemoryRecord[]): ContinuityBootstrapOutput["context_pack"] {
  const byText = new Map(memories.map((memory) => [memory.canonicalText, memory]));
  const pack: ContinuityBootstrapOutput["context_pack"] = {
    user: [],
    procedures: [],
    project: [],
    tool_memory: [],
    failure_memory: [],
  };

  for (const text of selectedTexts.length > 0 ? selectedTexts : memories.map((memory) => memory.canonicalText)) {
    const memory = byText.get(text);
    if (!memory) {
      pack.user.push(text);
      continue;
    }
    if (memory.type === "procedure") pack.procedures.push(text);
    else if (memory.type === "project_fact" || memory.type === "decision_memory") pack.project.push(text);
    else if (memory.type === "tool_memory") pack.tool_memory.push(text);
    else if (memory.type === "failure_memory") pack.failure_memory.push(text);
    else pack.user.push(text);
  }

  return pack;
}

function resourceFilter(input: MemoryResourceRequest, caller: CallerContext | undefined): MemoryListFilter {
  if (isAuthEnforced(caller)) {
    return guardedResourceFilter(input, caller);
  }
  return demoResourceFilter(input);
}

function guardedResourceFilter(input: MemoryResourceRequest, caller: CallerContext): MemoryListFilter {
  if (input.name === "vault-pending") {
    return { scope: scopeForCallerResource(caller, {}, input.name), statuses: ["pending"] };
  }
  if (input.name === "agent-procedures") {
    return {
      scope: scopeForCallerResource(caller, { agentProfileId: input.variables.agent_profile_id }, input.name),
      types: ["procedure"],
    };
  }
  if (input.name === "agent-failures") {
    return {
      scope: scopeForCallerResource(caller, { agentProfileId: input.variables.agent_profile_id }, input.name),
      types: ["failure_memory"],
    };
  }
  if (input.name === "project-facts") {
    return {
      scope: scopeForCallerResource(caller, { projectId: input.variables.project_id }, input.name),
      types: ["project_fact", "decision_memory"],
    };
  }
  if (input.name === "project-tool-notes") {
    return {
      scope: scopeForCallerResource(caller, { projectId: input.variables.project_id }, input.name),
      types: ["tool_memory"],
    };
  }
  return { scope: scopeForCallerResource(caller, { userId: input.variables.user_id }, input.name) };
}

function scopeForCallerResource(
  caller: CallerContext,
  requested: Partial<Pick<MemoryScope, "tenantId" | "userId" | "agentProfileId" | "projectId">>,
  operation: string,
): MemoryScope {
  const scope = applyCallerAllowedDefaults({
    tenantId: requested.tenantId ?? caller.tenantId,
    userId: requested.userId ?? caller.userId,
    agentProfileId: requested.agentProfileId,
    projectId: requested.projectId,
  }, caller);
  assertScopedRequestNarrowed(scope, caller, `${operation} resource`);
  return scope;
}

function demoResourceFilter(input: MemoryResourceRequest): MemoryListFilter {
  if (input.name === "vault-pending") {
    return { statuses: ["pending"] };
  }
  if (input.name === "agent-procedures") {
    return { scope: { tenantId: DEFAULT_TENANT_ID, userId: DEFAULT_USER_ID, agentProfileId: input.variables.agent_profile_id }, types: ["procedure"] };
  }
  if (input.name === "agent-failures") {
    return { scope: { tenantId: DEFAULT_TENANT_ID, userId: DEFAULT_USER_ID, agentProfileId: input.variables.agent_profile_id }, types: ["failure_memory"] };
  }
  if (input.name === "project-facts") {
    return { scope: { tenantId: DEFAULT_TENANT_ID, userId: DEFAULT_USER_ID, projectId: input.variables.project_id }, types: ["project_fact", "decision_memory"] };
  }
  if (input.name === "project-tool-notes") {
    return { scope: { tenantId: DEFAULT_TENANT_ID, userId: DEFAULT_USER_ID, projectId: input.variables.project_id }, types: ["tool_memory"] };
  }
  return { scope: { tenantId: DEFAULT_TENANT_ID, userId: input.variables.user_id ?? DEFAULT_USER_ID } };
}

function scopeFromRun(run: RunRecord): MemoryScope {
  return {
    tenantId: run.tenantId,
    userId: run.userId,
    hostId: run.hostId,
    agentProfileId: run.agentProfileId,
    projectId: run.projectId,
  };
}

function toJsonObject(value: Record<string, unknown> | undefined): JsonObject | undefined {
  if (!value) {
    return undefined;
  }

  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      output[key] = toJsonValue(item);
    }
  }
  return output;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map((item) => toJsonValue(item));
  }
  if (typeof value === "object") {
    return toJsonObject(value as Record<string, unknown>) ?? {};
  }
  return String(value);
}

async function seedDemoMemories(store: MemoryStore): Promise<void> {
  const existing = await store.listMemories({ scope: { tenantId: DEFAULT_TENANT_ID, userId: DEFAULT_USER_ID } });
  if (existing.length > 0) {
    return;
  }

  for (const memory of DEMO_MEMORIES) {
    await store.addMemory(memory, {
      actor: { type: "system", id: "demo_seed" },
      reason: "Seed AI Opportunity Scout demo memory.",
    });
  }
}

const DEMO_SCOPE: MemoryScope = {
  tenantId: DEFAULT_TENANT_ID,
  userId: DEFAULT_USER_ID,
  agentProfileId: DEFAULT_AGENT_PROFILE_ID,
};

const DEMO_MEMORIES: CreateMemoryInput[] = [
  {
    id: "demo-mem-pref-agent-memory-hackathons",
    scope: DEMO_SCOPE,
    type: "user_preference",
    canonicalText: "User prefers AI hackathons focused on AI Agents, MemoryAgent, persistent agent memory, persistent context, or agent workflow infrastructure.",
    rawSource: "Session 1 demo user statement.",
    sourceKind: "user_statement",
    status: "active",
    confidence: 0.96,
    importance: 0.92,
    metadata: { demoSeed: true },
  },
  {
    id: "demo-mem-pref-credential-network-founder",
    scope: DEMO_SCOPE,
    type: "user_preference",
    canonicalText: "When comparing opportunities, user values credential lift, useful network, founder resources, mentor access, and product credibility over prize money alone.",
    rawSource: "Session 1 demo user preference.",
    sourceKind: "user_statement",
    status: "active",
    confidence: 0.95,
    importance: 0.9,
    metadata: { demoSeed: true },
  },
  {
    id: "demo-mem-procedure-verify-deadline-eligibility-timezone",
    scope: DEMO_SCOPE,
    type: "procedure",
    canonicalText: "Before ranking or recommending a hackathon, verify the official deadline, submission timezone, region and eligibility rules, and track fit from primary sources; mark any unverified field as pending rather than confirmed.",
    rawSource: "Session 1 procedure requirement and Session 3 failure reflection.",
    sourceKind: "user_instruction",
    status: "active",
    confidence: 0.97,
    importance: 0.98,
    metadata: { demoSeed: true },
  },
  {
    id: "demo-mem-failure-region-eligibility-mistake",
    scope: DEMO_SCOPE,
    type: "failure_memory",
    canonicalText: "Previous opportunity scouting failed by recommending an event before checking whether China or Hong Kong participants were eligible. Treat region or eligibility mismatch as a hard disqualifier unless the user explicitly asks for a watchlist item.",
    rawSource: "Session 3 demo correction.",
    sourceKind: "post_run_reflection",
    status: "active",
    confidence: 0.93,
    importance: 0.96,
    metadata: { demoSeed: true },
  },
  {
    id: "demo-mem-decision-qwen-trae-cockroachdb-ranking",
    scope: {
      ...DEMO_SCOPE,
      projectId: "ai-opportunity-scout",
    },
    type: "decision_memory",
    canonicalText: "For the MVP demo ranking, prioritize Qwen Cloud Track 1 / MemoryAgent as P0 when deadline and eligibility are verified because it directly matches persistent agent memory and Qwen memory reasoning; consider TRAE P1 when it supports developer-agent workflow and network goals; keep CockroachDB P2 or watchlist unless database/backend resources materially improve the current build. Live facts remain verification gates.",
    rawSource: "Session 2 demo decision rubric.",
    sourceKind: "decision_record",
    status: "active",
    confidence: 0.88,
    importance: 0.86,
    metadata: { demoSeed: true },
  },
];
